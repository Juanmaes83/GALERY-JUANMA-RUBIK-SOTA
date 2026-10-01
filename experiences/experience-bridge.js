/**
 * Experience Bridge — generic host↔standalone seam.
 *
 * Museum is the host; a donor is an isolated standalone experience that keeps
 * its own runtime, rendering pipeline and animation loop. This bridge hosts ONE
 * such standalone in an iframe and speaks only a tiny, donor-agnostic contract:
 *
 *   host → experience:  setSource(file) · replay() · reset()
 *   experience → host:  status ∈ BOOTING|READY|PROCESSING|RESULT_READY|ERROR
 *                       captureResult() → still image (for a wall plate)
 *                       element (the iframe, for the full experience view)
 *
 * The bridge contains NO donor algorithm and NO donor-specific ids. All of that
 * lives in the per-donor `adapter` passed in. This is the same isolation proven
 * by Casebook PRO and Rope Gallery PRO: the platform points an iframe at the
 * canonical standalone and delegates; it never re-runs the runtime itself.
 *
 * The iframe is kept alive (rendered off-screen) while the full view is closed,
 * so donor state is preserved between openings — V1 hides, it does not dispose.
 */

const STATUS = Object.freeze({
    BOOTING: 'BOOTING',
    READY: 'READY',
    PROCESSING: 'PROCESSING',
    RESULT_READY: 'RESULT_READY',
    ERROR: 'ERROR',
});

function styleClosed(container) {
    // Kept in the layout and rendered (WebGL/rAF keep running) but out of sight
    // and non-interactive. Not display:none — that would suspend the donor.
    Object.assign(container.style, {
        position: 'fixed',
        left: '-100000px',
        top: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '-1',
        pointerEvents: 'none',
        visibility: 'visible',
    });
}

function styleOpen(container) {
    Object.assign(container.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '60',
        pointerEvents: 'auto',
        visibility: 'visible',
    });
}

export function createExperienceBridge({ id, url, adapter, onStatus }) {
    const container = document.createElement('section');
    container.className = 'experience-host';
    container.dataset.experienceId = id;
    container.style.background = '#100f0e';
    styleClosed(container);

    const iframe = document.createElement('iframe');
    iframe.title = `${id} — experiencia real`;
    iframe.allow = 'autoplay; fullscreen';
    Object.assign(iframe.style, { width: '100%', height: '100%', border: '0', display: 'block', background: '#0a0908' });
    iframe.src = url;
    container.appendChild(iframe);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'experience-close';
    closeBtn.textContent = 'Volver a la sala';
    Object.assign(closeBtn.style, {
        position: 'absolute', top: '12px', right: '12px', zIndex: '1',
        padding: '8px 14px', borderRadius: '999px', cursor: 'pointer',
        border: '1px solid rgba(236,231,221,.4)', background: 'rgba(16,15,14,.9)',
        color: '#ece7dd', font: '500 12px/1 system-ui, sans-serif', letterSpacing: '.06em',
    });
    closeBtn.addEventListener('click', () => close());
    container.appendChild(closeBtn);

    document.body.appendChild(container);

    let opened = false;
    const report = (status, extra) => { try { onStatus?.(status, extra); } catch { /* noop */ } };

    function loaded() {
        return new Promise((resolve) => {
            if (iframe.contentDocument?.readyState === 'complete') { resolve(); return; }
            iframe.addEventListener('load', () => resolve(), { once: true });
        });
    }

    async function waitReady(timeoutMs = 30000) {
        await loaded();
        // Let the adapter dress the freshly loaded document (e.g. inject a skin
        // and relabel) before anything is revealed, so no donor chrome flashes.
        try { adapter.onLoad?.(iframe); } catch { /* noop */ }
        const start = performance.now();
        while (performance.now() - start < timeoutMs) {
            if (adapter.isReady(iframe)) { try { adapter.onLoad?.(iframe); } catch { /* noop */ } return true; }
            await new Promise((r) => setTimeout(r, 150));
        }
        return false;
    }

    /**
     * Hand the current source to the donor and resolve when it has finished
     * producing a result (or errored / timed out). Returns { status, resultDataUrl }.
     */
    async function process(file, { timeoutMs = 25000 } = {}) {
        const ready = await waitReady();
        if (!ready) { report(STATUS.ERROR, { reason: 'standalone not ready' }); return { status: STATUS.ERROR }; }

        report(STATUS.PROCESSING);
        adapter.setSource(iframe, file);

        const start = performance.now();
        let last = STATUS.PROCESSING;
        while (performance.now() - start < timeoutMs) {
            await new Promise((r) => setTimeout(r, 200));
            const s = adapter.readStatus(iframe, start);
            if (s.status !== last) { report(s.status, s); last = s.status; }
            if (s.status === STATUS.RESULT_READY) {
                const resultDataUrl = await adapter.captureResult(iframe);
                report(STATUS.RESULT_READY, { ...s, captured: Boolean(resultDataUrl) });
                return { status: STATUS.RESULT_READY, resultDataUrl };
            }
            if (s.status === STATUS.ERROR) return { status: STATUS.ERROR, detail: s };
        }
        report(STATUS.ERROR, { reason: 'timeout' });
        return { status: STATUS.ERROR };
    }

    function replay() { adapter.replay?.(iframe); }
    function reset() { adapter.reset?.(iframe); }
    function open() { opened = true; styleOpen(container); }
    function close() { opened = false; styleClosed(container); }
    function isOpen() { return opened; }
    function dispose() {
        opened = false;
        iframe.src = 'about:blank';
        container.remove();
    }

    return {
        id,
        element: iframe,
        container,
        process,
        replay,
        reset,
        open,
        close,
        dispose,
        isOpen,
        waitReady,
        captureResult: () => adapter.captureResult(iframe),
        readStatus: (since) => adapter.readStatus(iframe, since),
    };
}

export { STATUS };
