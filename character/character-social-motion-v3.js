import { THREE } from '../render/render-host.js';

export const SOCIAL_V3_PROVENANCE = Object.freeze({
  source: 'CharacterStudio SocialMotionFoundationV3.js',
  sourceCommit: 'f5a93a48ed0e3904fce58f08f7fbe08b5411b289',
  frozenBlobSha: '2490cc4e36e1464d237000caca457d5b73dd79ec'
});

const NEUTRAL = {
  leftUpperArm:[0,0,1.18], rightUpperArm:[0,0,-1.18],
  leftLowerArm:[.08,0,-.18], rightLowerArm:[.08,0,.18],
  chest:[.02,0,0], head:[0,0,0]
};

export const SOCIAL_V3_DEFINITIONS = Object.freeze({
  WAVE:{duration:1.65,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.16,bones:{...NEUTRAL,rightUpperArm:[-.72,-.10,-.52],rightLowerArm:[-1.18,.10,.18],chest:[.01,-.05,0],head:[0,-.08,0]}},
    {t:.34,bones:{...NEUTRAL,rightUpperArm:[-.74,-.10,-.50],rightLowerArm:[-1.12,.32,.24],chest:[.01,-.06,0],head:[0,-.08,0]}},
    {t:.50,bones:{...NEUTRAL,rightUpperArm:[-.74,-.10,-.50],rightLowerArm:[-1.12,-.30,.10],chest:[.01,-.06,0],head:[0,-.08,0]}},
    {t:.66,bones:{...NEUTRAL,rightUpperArm:[-.74,-.10,-.50],rightLowerArm:[-1.12,.30,.24],chest:[.01,-.06,0],head:[0,-.08,0]}},
    {t:.82,bones:{...NEUTRAL,rightUpperArm:[-.72,-.10,-.52],rightLowerArm:[-1.18,.05,.18],chest:[.01,-.04,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  GOODBYE:{duration:1.95,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.18,bones:{...NEUTRAL,rightUpperArm:[-.62,-.12,-.56],rightLowerArm:[-1.05,.08,.16],chest:[.02,-.08,0],head:[.02,-.10,0]}},
    {t:.38,bones:{...NEUTRAL,rightUpperArm:[-.65,-.12,-.54],rightLowerArm:[-1,.34,.20],chest:[.02,-.10,0],head:[.03,-.10,0]}},
    {t:.58,bones:{...NEUTRAL,rightUpperArm:[-.65,-.12,-.54],rightLowerArm:[-1,-.34,.08],chest:[.02,-.10,0],head:[.06,-.08,0]}},
    {t:.78,bones:{...NEUTRAL,rightUpperArm:[-.62,-.12,-.56],rightLowerArm:[-1.05,.12,.16],chest:[.01,-.06,0],head:[.04,-.04,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  POINT:{duration:1.45,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.22,bones:{...NEUTRAL,rightUpperArm:[-.22,-.52,-.46],rightLowerArm:[-.40,.08,.12],chest:[.02,-.12,0],head:[0,-.18,0]}},
    {t:.48,bones:{...NEUTRAL,rightUpperArm:[-.12,-.72,-.30],rightLowerArm:[-.16,.04,.05],chest:[.02,-.18,0],head:[0,-.24,0]}},
    {t:.76,bones:{...NEUTRAL,rightUpperArm:[-.12,-.72,-.30],rightLowerArm:[-.16,.04,.05],chest:[.02,-.18,0],head:[0,-.24,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  NOD:{duration:1.05,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.24,bones:{...NEUTRAL,head:[.26,0,0],chest:[.04,0,0]}},
    {t:.48,bones:{...NEUTRAL,head:[-.10,0,0],chest:[.01,0,0]}},
    {t:.70,bones:{...NEUTRAL,head:[.16,0,0],chest:[.03,0,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  WELCOME:{duration:1.70,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.22,bones:{...NEUTRAL,leftUpperArm:[-.30,.10,.78],rightUpperArm:[-.30,-.10,-.78],leftLowerArm:[-.55,-.08,-.10],rightLowerArm:[-.55,.08,.10],chest:[-.04,0,0],head:[.03,0,0]}},
    {t:.50,bones:{...NEUTRAL,leftUpperArm:[-.38,.16,.56],rightUpperArm:[-.38,-.16,-.56],leftLowerArm:[-.34,-.16,-.04],rightLowerArm:[-.34,.16,.04],chest:[-.08,0,0],head:[.05,0,0]}},
    {t:.78,bones:{...NEUTRAL,leftUpperArm:[-.34,.10,.66],rightUpperArm:[-.34,-.10,-.66],leftLowerArm:[-.44,-.10,-.06],rightLowerArm:[-.44,.10,.06],chest:[-.05,0,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  AFTER_YOU:{duration:1.60,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.22,bones:{...NEUTRAL,rightUpperArm:[-.24,-.28,-.56],rightLowerArm:[-.44,.02,.10],chest:[.04,-.14,0],head:[.02,-.16,0]}},
    {t:.50,bones:{...NEUTRAL,rightUpperArm:[-.20,-.48,-.38],rightLowerArm:[-.26,.02,.06],chest:[.06,-.24,0],head:[.03,-.24,0]}},
    {t:.78,bones:{...NEUTRAL,rightUpperArm:[-.20,-.48,-.38],rightLowerArm:[-.26,.02,.06],chest:[.04,-.20,0],head:[.02,-.20,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]}
});

export const SOCIAL_V3_ACTIONS = Object.freeze(Object.keys(SOCIAL_V3_DEFINITIONS));

export function registerSocialMotionV3(motion) {
  if (!motion?.registerDefinition) throw new Error('Social Motion V3 requires extensible Museum Motion V2');
  const report = {};
  for (const [name, definition] of Object.entries(SOCIAL_V3_DEFINITIONS)) {
    motion.registerDefinition(name, definition, { loop:false, recoverTo:'IDLE_V2', fadeSeconds:.16, source:'SOCIAL_V3' });
    report[name] = { duration:definition.duration, source:'Social Motion Foundation V3', provenance:SOCIAL_V3_PROVENANCE };
  }
  return report;
}
