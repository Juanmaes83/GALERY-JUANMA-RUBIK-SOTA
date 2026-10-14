/**
 * Wet Paint personalization store — browser-local persistence for the itinerant
 * lab. Deliberately a dedicated key, separate from Museum's normalised authoring
 * config, so persisting a donor parameter set never has to fight the global
 * config schema. Same spirit as authoring/config-store.js (localStorage, a few
 * KB of JSON), scoped to this experience.
 *
 * Persisted per painterly entity:
 *   { sourceName, params, viewMode, brushLayers, quality, resultDataUrl }
 *
 * resultDataUrl is what makes authoring and the visitor agree on one truth: the
 * 02 plate is restored from the exact frame the author applied.
 */

const KEY = 'iw.wetpaint.personalization.v1';

function readAll() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export const WetPaintStore = {
    get(entityId) {
        return readAll()[entityId] || null;
    },

    save(entityId, record) {
        try {
            const all = readAll();
            all[entityId] = { ...record, savedAt: Date.now() };
            localStorage.setItem(KEY, JSON.stringify(all));
            return true;
        } catch {
            // Quota (a data-URL result can be large) or a locked store: report,
            // do not throw — a failed persist must not break the applied result.
            return false;
        }
    },

    clear(entityId) {
        try {
            const all = readAll();
            delete all[entityId];
            localStorage.setItem(KEY, JSON.stringify(all));
        } catch { /* noop */ }
    },
};
