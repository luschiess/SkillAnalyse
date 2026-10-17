import type { AnalysisSupport, CategoryId, Skill, SkillType } from '../types'

type Entry = {
  name: string
  categoryName?: string
  level: number
  type: SkillType
  description: string
  camera?: string
  checkpoints: string[]
  analysisSupport?: AnalysisSupport
  equipment?: string[]
  prerequisites?: string[]
  commonErrors?: string[]
  safety?: string[]
}

type Group = {
  category: CategoryId
  categoryName: string
  equipment: string[]
  entries: Entry[]
}

const groups: Group[] = [
  {
    category: 'handstand',
    categoryName: 'Handstand',
    equipment: ['Wall', 'Floor'],
    entries: [
      { name: 'Chest-to-Wall Handstand', level: 2, type: 'static', description: 'Build a straight, stacked handstand with your chest facing the wall for light support.', checkpoints: ['Push tall through the shoulders', 'Keep ribs controlled', 'Walk down before fatigue'], analysisSupport: 'partial' },
      { name: 'Back-to-Wall Handstand', level: 1, type: 'static', description: 'Practice a supported vertical line with your back toward the wall.', checkpoints: ['Use the wall only as needed', 'Keep elbows straight', 'Exit with control'], analysisSupport: 'partial' },
      { name: 'Handstand Shoulder Taps', level: 4, type: 'dynamic', description: 'Shift weight between hands and briefly tap the opposite shoulder while inverted.', checkpoints: ['Shift before lifting a hand', 'Keep hips controlled', 'Use a safe wall setup'], analysisSupport: 'manual', safety: ['Practice weight shifts before attempting taps', 'Use a clear landing area'] },
      { name: 'Handstand Weight Shifts', level: 3, type: 'dynamic', description: 'Move pressure gradually from one hand to the other while maintaining a supported handstand.', checkpoints: ['Keep shoulders active', 'Move slowly', 'Avoid twisting the trunk'], analysisSupport: 'partial' },
      { name: 'Handstand Press', level: 4, type: 'dynamic', description: 'A general category for controlled press-to-handstand entries from a compressed pike, tuck or straddle start.', checkpoints: ['Lift hips before extending', 'Keep the press controlled', 'Finish in a stable handstand'], analysisSupport: 'manual' },
      { name: 'Luschies Skill', categoryName: 'Handstand / Press-to-Handstand', level: 4, type: 'dynamic', description: 'Press from a kneeling start into a handstand.', camera: 'Side view; keep the full body, hands and floor visible.', checkpoints: ['Begin from a kneeling position', 'Move upward under control', 'Finish in a handstand'], analysisSupport: 'partial' },
      { name: 'Tuck Press to Handstand', level: 4, type: 'dynamic', description: 'Lift the hips and draw the knees in as you press from a compact tuck to handstand.', checkpoints: ['Lean shoulders forward', 'Lift hips before extending', 'Finish with control'], analysisSupport: 'partial' },
      { name: 'Straddle Press to Handstand', level: 4, type: 'dynamic', description: 'Press from a wide straddle while raising the hips over the hands.', checkpoints: ['Keep knees extended', 'Elevate hips smoothly', 'Close the legs after stacking'], analysisSupport: 'partial' },
      { name: 'Pike Press to Handstand', level: 5, type: 'dynamic', description: 'Press with straight legs together from a pike position into handstand.', checkpoints: ['Maintain compression', 'Lean shoulders forward', 'Avoid kicking into the finish'], analysisSupport: 'partial' },
      { name: 'Stalder Press', level: 5, type: 'dynamic', description: 'Press to handstand from a wide straddle with the legs passing between the arms.', checkpoints: ['Keep legs active', 'Raise hips before closing', 'Use a controlled negative to build capacity'], analysisSupport: 'manual', safety: ['Build shoulder and compression strength first'] },
      { name: 'Handstand Negative', level: 4, type: 'dynamic', description: 'Lower from handstand through a controlled range toward a chosen safe landing position.', checkpoints: ['Maintain shoulder elevation', 'Control the descent', 'Exit before losing balance'], analysisSupport: 'manual', safety: ['Use a spotter or safe open area while learning'] },
      { name: 'Negative Handstand Push-up', level: 4, type: 'dynamic', description: 'Lower from a handstand position through a controlled pressing range without assuming a complete push-up repetition.', checkpoints: ['Use a safe head target', 'Control the descent', 'Exit before shoulder position fails'], analysisSupport: 'manual', safety: ['Use a wall or qualified spotter while learning'] },
      { name: '90-Degree Push-up', level: 5, type: 'dynamic', description: 'A demanding bent-arm press that lowers from handstand toward a horizontal position and presses back.', checkpoints: ['Build the range progressively', 'Keep wrists and shoulders prepared', 'Avoid uncontrolled descent'], analysisSupport: 'manual', safety: ['Advanced skill; use qualified coaching and gradual progressions'] },
      { name: 'Handstand Pirouette', level: 4, type: 'dynamic', description: 'Rotate around the hands with small controlled steps while maintaining an inverted position.', checkpoints: ['Keep rotation gradual', 'Reposition hands deliberately', 'Land with a planned exit'], analysisSupport: 'manual', safety: ['Practice only with clear space and a safe exit'] },
      { name: 'One-Arm Handstand', level: 5, type: 'static', description: 'Balance inverted primarily over one arm with the free hand assisting or lifted.', checkpoints: ['Master reliable two-arm balance first', 'Shift gradually over the support hand', 'Keep the support shoulder active'], analysisSupport: 'manual', safety: ['Extremely advanced; use progressive coaching'] },
      { name: 'One-Arm Handstand Push-up', level: 5, type: 'dynamic', description: 'An extreme unilateral inverted pressing skill requiring exceptional balance and strength.', checkpoints: ['Develop one-arm balance and pressing separately', 'Use a highly controlled range', 'Stop at any wrist or shoulder pain'], analysisSupport: 'manual', safety: ['Extreme skill; not appropriate without advanced coaching and preparation'] },
    ],
  },
  {
    category: 'back-lever',
    categoryName: 'Back lever',
    equipment: ['Rings', 'Bar'],
    entries: [
      { name: 'Skin the Cat', level: 2, type: 'dynamic', description: 'Rotate through a controlled shoulder extension into and out of a German hang.', checkpoints: ['Use a comfortable range', 'Keep the movement slow', 'Return without dropping'], analysisSupport: 'manual', safety: ['Avoid forced shoulder range; stop if painful'] },
      { name: 'German Hang', level: 2, type: 'static', description: 'Hold a supported shoulder-extension position beneath rings or a bar.', checkpoints: ['Use a tolerable shoulder range', 'Keep support secure', 'Exit deliberately'], analysisSupport: 'manual', safety: ['Do not force end-range shoulder extension'] },
      { name: 'Tuck Back Lever', level: 3, type: 'static', description: 'Hold a compact horizontal position with knees tucked and arms straight.', checkpoints: ['Keep elbows extended', 'Maintain shoulder control', 'Use a secure apparatus'], analysisSupport: 'manual', safety: ['Build gradually; stop for shoulder or elbow pain'] },
      { name: 'Advanced Tuck Back Lever', level: 4, type: 'static', description: 'Open the tuck while maintaining a horizontal body line in the back lever.', checkpoints: ['Extend the hips gradually', 'Keep shoulders engaged', 'Avoid bouncing into position'], analysisSupport: 'manual' },
      { name: 'One-Leg Back Lever', level: 4, type: 'static', description: 'Extend one leg while holding a controlled back lever with a level pelvis.', checkpoints: ['Keep pelvis level', 'Alternate sides', 'Maintain straight support arms'], analysisSupport: 'manual' },
      { name: 'Straddle Back Lever', level: 5, type: 'static', description: 'Hold a horizontal back lever with both legs extended in a straddle.', checkpoints: ['Keep knees straight', 'Control the straddle width', 'Avoid shoulder discomfort'], analysisSupport: 'manual', safety: ['Use only a pain-free shoulder range'] },
      { name: 'Full Back Lever', level: 5, type: 'static', description: 'Maintain a straight horizontal line from shoulders to ankles in a back lever.', checkpoints: ['Keep the body line straight', 'Lock elbows without hyperextension', 'Enter and exit under control'], analysisSupport: 'manual', safety: ['Advanced lever; progress gradually'] },
      { name: 'Back Lever Raises', level: 5, type: 'dynamic', description: 'Raise and lower through a back-lever range without swinging.', checkpoints: ['Use a manageable range', 'Keep shoulders engaged', 'Avoid momentum'], analysisSupport: 'manual' },
    ],
  },
  {
    category: 'bar-skills',
    categoryName: 'Bar skills',
    equipment: ['Bar'],
    entries: [
      { name: 'Pull-up', level: 1, type: 'dynamic', description: 'Pull from an active hang to bring the chin over the bar, then lower with control.', checkpoints: ['Begin from an active shoulder position', 'Avoid kicking', 'Control the descent'], analysisSupport: 'manual' },
      { name: 'Muscle-up', level: 3, type: 'dynamic', description: 'Transition from a hang to support above a bar using a controlled pull and turnover.', checkpoints: ['Pull high before turning over', 'Keep the bar close', 'Stabilize above support'], analysisSupport: 'manual', safety: ['Use a secure bar and practice the transition with appropriate progressions'] },
      { name: 'Strict Muscle-up', level: 4, type: 'dynamic', description: 'Perform a controlled muscle-up with minimal swing and a smooth transition.', checkpoints: ['Pull high before transition', 'Keep wrists close to the bar', 'Control the dip-out'], analysisSupport: 'manual', safety: ['Use a secure bar and build transition strength'] },
      { name: 'Explosive Muscle-up', level: 4, type: 'dynamic', description: 'Use a powerful pull to transition above the bar with controlled support.', checkpoints: ['Pull to lower chest', 'Move through the transition decisively', 'Stabilize above the bar'], analysisSupport: 'manual', safety: ['Ensure adequate clearance and a secure bar'] },
      { name: 'L-Sit Muscle-up', level: 5, type: 'dynamic', description: 'Perform a muscle-up while maintaining a compressed L-sit leg position.', checkpoints: ['Maintain leg compression', 'Avoid excessive swing', 'Control the transition'], analysisSupport: 'manual' },
      { name: 'High Pull-up', level: 3, type: 'dynamic', description: 'Pull higher than a standard pull-up while keeping the body controlled.', checkpoints: ['Initiate with active shoulders', 'Pull elbows down and back', 'Lower under control'], analysisSupport: 'manual' },
      { name: 'Chest-to-Bar Pull-up', level: 3, type: 'dynamic', description: 'Pull until the upper chest reaches the bar with a controlled return.', checkpoints: ['Use a full active hang', 'Pull without kicking', 'Control the lowering phase'], analysisSupport: 'manual' },
      { name: 'Archer Pull-up', level: 4, type: 'dynamic', description: 'Pull predominantly with one arm while the other arm assists in a wide grip.', checkpoints: ['Keep the assisting arm controlled', 'Alternate sides', 'Avoid twisting'], analysisSupport: 'manual' },
      { name: 'One-Arm Pull-up', level: 5, type: 'dynamic', description: 'Perform a strict pull-up using one arm, with substantial unilateral loading.', checkpoints: ['Build assisted progressions', 'Keep shoulder engaged', 'Use a controlled range'], analysisSupport: 'manual', safety: ['Very advanced; avoid uncontrolled drops'] },
      { name: 'Typewriter Pull-up', level: 4, type: 'dynamic', description: 'Pull up and travel laterally across the bar while keeping one arm more loaded.', checkpoints: ['Move laterally under control', 'Keep shoulders active', 'Practice both directions'], analysisSupport: 'manual' },
      { name: 'Front Lever Rows', level: 4, type: 'dynamic', description: 'Row from a horizontal front-lever-like body position while maintaining a rigid trunk.', checkpoints: ['Keep hips level', 'Pull elbows toward the ribs', 'Avoid swinging'], analysisSupport: 'manual' },
      { name: 'Front Lever Touch', level: 5, type: 'dynamic', description: 'Pull from a front lever toward the bar while maintaining the horizontal line.', checkpoints: ['Use a strict body line', 'Pull symmetrically', 'Lower slowly'], analysisSupport: 'manual' },
      { name: 'Front Lever to Inverted Hang', level: 5, type: 'dynamic', description: 'Transition between a front lever and inverted hang under full control.', checkpoints: ['Keep shoulders engaged', 'Control the rotation', 'Use a secure grip'], analysisSupport: 'manual', safety: ['Advanced transition; use a secure bar or rings'] },
      { name: 'Front Lever Negatives', level: 4, type: 'dynamic', description: 'Lower slowly from an inverted hang toward a front-lever progression.', checkpoints: ['Choose a manageable tuck', 'Control shoulder extension', 'Stop before form breaks'], analysisSupport: 'manual' },
      { name: 'Front Lever Pull-up Variations', level: 5, type: 'dynamic', description: 'A category of bent-arm front-lever pulling variations using individualized progressions.', checkpoints: ['Select a variation that preserves body control', 'Avoid swinging', 'Track left-right symmetry'], analysisSupport: 'manual' },
    ],
  },
  {
    category: 'push-up',
    categoryName: 'Push-ups',
    equipment: ['Floor'],
    entries: [
      { name: 'Typewriter Push-up', level: 4, type: 'dynamic', description: 'Shift laterally at the bottom of a push-up while keeping one arm more bent.', checkpoints: ['Move laterally smoothly', 'Keep hips square', 'Alternate loaded sides'], analysisSupport: 'partial' },
      { name: 'Behind-the-Back Clap Push-up', level: 5, type: 'dynamic', description: 'An explosive push-up variation with a clap behind the torso during flight.', checkpoints: ['Build explosive push-ups first', 'Land with elbows soft', 'Maintain a rigid trunk'], analysisSupport: 'manual', safety: ['High-impact variation; use a forgiving surface and stop if wrists hurt'] },
      { name: 'Tiger Bend Push-up', level: 5, type: 'dynamic', description: 'Move from forearms to hands and press while maintaining a controlled trunk.', checkpoints: ['Keep elbows and wrists aligned', 'Use a repeatable range', 'Avoid collapsing into the shoulders'], analysisSupport: 'partial' },
      { name: 'Planche Push-up', level: 5, type: 'dynamic', description: 'Perform a push-up while maintaining a forward-leaning planche body position.', checkpoints: ['Build planche lean strength first', 'Keep shoulders ahead of wrists', 'Use a controlled range'], analysisSupport: 'manual', safety: ['Advanced wrist and shoulder loading; progress gradually'] },
      { name: 'Maltese Push-up', level: 5, type: 'dynamic', description: 'An extreme wide-arm straight-body pressing variation with high shoulder demands.', checkpoints: ['Develop foundational straight-arm strength', 'Use very gradual loading', 'Stop at discomfort'], analysisSupport: 'manual', safety: ['Extreme skill; seek qualified coaching'] },
    ],
  },
  {
    category: 'planche',
    categoryName: 'Planche',
    equipment: ['Floor', 'Parallettes'],
    entries: [
      { name: 'Planche Lean', level: 2, type: 'static', description: 'Lean the shoulders forward over the wrists while keeping elbows straight and the body braced.', checkpoints: ['Spread fingers and grip the floor', 'Keep elbows straight', 'Increase lean gradually'], analysisSupport: 'manual', safety: ['Scale wrist loading to tolerance'] },
      { name: 'Frog Stand', level: 1, type: 'static', description: 'Balance with knees supported on the arms and hands planted on the floor.', checkpoints: ['Look slightly ahead', 'Shift weight slowly', 'Use a soft landing area'], analysisSupport: 'manual' },
      { name: 'Tuck Planche', level: 3, type: 'static', description: 'Hold the body off the floor with knees tucked and shoulders leaning over the hands.', checkpoints: ['Push the floor away', 'Keep elbows straight', 'Hold hips above the hands'], analysisSupport: 'manual', safety: ['Build wrist and shoulder preparation first'] },
      { name: 'Advanced Tuck Planche', level: 4, type: 'static', description: 'Extend the hips away from the shoulders while keeping knees tucked in planche.', checkpoints: ['Maintain protraction', 'Keep hips level', 'Progress in small steps'], analysisSupport: 'manual' },
      { name: 'One-Leg Planche', level: 4, type: 'static', description: 'Extend one leg while balancing in a planche position.', checkpoints: ['Keep hips square', 'Alternate extended leg', 'Maintain straight elbows'], analysisSupport: 'manual' },
      { name: 'Straddle Planche', level: 5, type: 'static', description: 'Hold a horizontal planche with extended legs separated in a straddle.', checkpoints: ['Keep shoulders protracted', 'Maintain a level pelvis', 'Use controlled entries'], analysisSupport: 'manual', safety: ['Very advanced straight-arm strength skill'] },
      { name: 'Full Planche', level: 5, type: 'static', description: 'Hold a straight horizontal body line with legs together and no external support.', checkpoints: ['Keep elbows locked safely', 'Push tall through the shoulders', 'Avoid uncontrolled entry'], analysisSupport: 'manual', safety: ['Extreme skill; build progressive strength and use coaching'] },
      { name: 'Planche Lean Push-up', level: 3, type: 'dynamic', description: 'Perform push-ups with shoulders leaned forward over the wrists.', checkpoints: ['Maintain the forward lean', 'Keep body rigid', 'Use controlled depth'], analysisSupport: 'partial' },
      { name: 'Tuck Planche Push-up', level: 4, type: 'dynamic', description: 'Bend and extend the arms while holding a compact tuck planche.', checkpoints: ['Keep hips elevated', 'Control elbow bend', 'Use a small repeatable range'], analysisSupport: 'manual' },
      { name: 'Straddle Planche Push-up', level: 5, type: 'dynamic', description: 'Perform bent-arm repetitions while maintaining a straddle planche body position.', checkpoints: ['Keep legs actively straddled', 'Control the descent', 'Avoid shoulder collapse'], analysisSupport: 'manual', safety: ['Extreme skill; require strong planche fundamentals'] },
      { name: 'Planche Press', level: 5, type: 'dynamic', description: 'Press from a planche progression into a higher support or handstand position.', checkpoints: ['Use a progression you can control', 'Keep shoulders protracted', 'Avoid kicking through the transition'], analysisSupport: 'manual' },
      { name: 'Planche to Handstand', level: 5, type: 'dynamic', description: 'Transition from planche toward handstand through a controlled press.', checkpoints: ['Build both positions independently', 'Control shoulder and wrist loading', 'Plan the exit'], analysisSupport: 'manual', safety: ['Highly advanced transition; use appropriate coaching'] },
    ],
  },
  {
    category: 'core',
    categoryName: 'L-sit, V-sit & core',
    equipment: ['Floor', 'Parallettes', 'Bar'],
    entries: [
      { name: 'Tuck Sit', level: 1, type: 'static', description: 'Support the body between the hands with knees tucked and feet lifted.', checkpoints: ['Depress shoulders', 'Keep arms straight', 'Lift feet without swinging'], analysisSupport: 'manual' },
      { name: 'L-Sit', level: 2, type: 'static', description: 'Hold the body on straight arms with both legs extended horizontally.', checkpoints: ['Push down through hands', 'Keep knees straight', 'Point toes comfortably'], analysisSupport: 'manual' },
      { name: 'Advanced L-Sit', level: 3, type: 'static', description: 'Hold an L-sit with increased leg height or compression.', checkpoints: ['Keep shoulders depressed', 'Maintain straight knees', 'Avoid leaning back excessively'], analysisSupport: 'manual' },
      { name: 'V-Sit', level: 4, type: 'static', description: 'Raise the straight legs above horizontal while maintaining a supported compression hold.', checkpoints: ['Build hamstring flexibility', 'Keep arms active', 'Increase height gradually'], analysisSupport: 'manual', safety: ['Do not force end-range hamstring or hip flexibility'] },
      { name: 'Manna', level: 5, type: 'static', description: 'An extreme shoulder-extension and compression support hold with legs elevated behind or above the torso.', checkpoints: ['Develop shoulder mobility gradually', 'Keep support stable', 'Stop at discomfort'], analysisSupport: 'manual', safety: ['Extreme mobility and strength demand; use qualified coaching'] },
      { name: 'Hanging Knee Raise', level: 1, type: 'dynamic', description: 'Raise bent knees from a controlled hang without swinging.', checkpoints: ['Start from active shoulders', 'Avoid kip', 'Lower with control'], analysisSupport: 'manual' },
      { name: 'Hanging Leg Raise', level: 3, type: 'dynamic', description: 'Raise straight legs from a hang using controlled trunk and hip flexion.', checkpoints: ['Keep the hang active', 'Limit swinging', 'Use a repeatable range'], analysisSupport: 'manual' },
      { name: 'Toes-to-Bar', level: 4, type: 'dynamic', description: 'Raise the feet to touch the bar while controlling the hang and return.', checkpoints: ['Build strict raises first', 'Control the swing', 'Keep grip secure'], analysisSupport: 'manual' },
      { name: 'Dragon Flag', level: 4, type: 'dynamic', description: 'Lower and raise a rigid body from shoulder support with controlled trunk tension.', checkpoints: ['Keep a long body line', 'Use a reduced lever if needed', 'Protect the neck'], analysisSupport: 'manual', safety: ['Use a stable bench and avoid loading the neck'] },
      { name: 'Compression Lifts', level: 2, type: 'dynamic', description: 'Lift straight or bent legs toward the torso while seated in a compression drill.', checkpoints: ['Sit tall', 'Lift without bouncing', 'Use pain-free range'], analysisSupport: 'manual' },
    ],
  },
  {
    category: 'dips-bars',
    categoryName: 'Dips & parallel bars',
    equipment: ['Parallel bars'],
    entries: [
      { name: 'Parallel Bar Support Hold', level: 1, type: 'static', description: 'Support the body above parallel bars with stable shoulders and straight arms.', checkpoints: ['Press bars down', 'Keep shoulders active', 'Step down safely'], analysisSupport: 'manual', safety: ['Check bars for stability before loading'] },
      { name: 'Straight Bar Dip', level: 2, type: 'dynamic', description: 'Lower and press above a straight bar using a controlled range.', checkpoints: ['Keep wrists secure over bar', 'Lean forward as needed', 'Avoid dropping into the shoulders'], analysisSupport: 'manual' },
      { name: 'Parallel Bar Dip', level: 2, type: 'dynamic', description: 'Lower between parallel bars and press back to stable support.', checkpoints: ['Keep shoulders controlled', 'Use comfortable depth', 'Avoid swinging'], analysisSupport: 'manual' },
      { name: 'Korean Dip', level: 4, type: 'dynamic', description: 'Perform a dip behind the body on a bar with controlled shoulder extension.', checkpoints: ['Use a secure low bar', 'Enter the range gradually', 'Keep the movement controlled'], analysisSupport: 'manual', safety: ['Shoulder-intensive range; do not force depth'] },
      { name: 'Russian Dip', level: 4, type: 'dynamic', description: 'Transition from forearm support to hands on parallel bars and press to support.', checkpoints: ['Use padded stable bars', 'Control the forearm transition', 'Avoid impact at the elbows'], analysisSupport: 'manual', safety: ['Use padding and a gradual progression'] },
      { name: 'Deep Dip', level: 3, type: 'dynamic', description: 'Perform a dip through an individually controlled deeper range.', checkpoints: ['Keep shoulders packed', 'Increase depth gradually', 'Avoid pain or bouncing'], analysisSupport: 'manual' },
      { name: 'Weighted Dip', level: 3, type: 'dynamic', description: 'A dip training category with external load added only after bodyweight control is established.', checkpoints: ['Use a secure load attachment', 'Maintain consistent depth', 'Progress load gradually'], analysisSupport: 'manual', safety: ['Secure external loads and avoid maximal attempts when fatigued'] },
      { name: 'L-Sit to Handstand', level: 5, type: 'dynamic', description: 'Press from an L-sit support into handstand on appropriate stable parallettes.', checkpoints: ['Build L-sit and press strength separately', 'Keep shoulders controlled', 'Use a planned exit'], analysisSupport: 'manual', safety: ['Advanced press; secure equipment and use coaching'] },
      { name: 'Press to Handstand on Parallettes', level: 4, type: 'dynamic', description: 'Press from a pike, straddle or tuck position to handstand using parallettes.', checkpoints: ['Check equipment stability', 'Keep wrists neutral', 'Control the press and exit'], analysisSupport: 'partial', safety: ['Ensure parallettes cannot slide or tip'] },
      { name: 'Handstand on Parallettes', level: 3, type: 'static', description: 'Balance in handstand while holding stable parallettes.', checkpoints: ['Grip securely', 'Stack shoulders and hips', 'Dismount deliberately'], analysisSupport: 'partial', safety: ['Inspect equipment and clear the landing area'] },
    ],
  },
  {
    category: 'human-flag',
    categoryName: 'Human flag',
    equipment: ['Vertical pole', 'Stall bars'],
    entries: [
      { name: 'Human Flag Progression', level: 2, type: 'combined', description: 'Build lateral-body strength and push-pull support toward a human flag hold.', checkpoints: ['Use a secure vertical support', 'Keep shoulders engaged', 'Progress from angled holds'], analysisSupport: 'manual', safety: ['Inspect the support and do not train on unstable structures'] },
      { name: 'Human Flag', level: 5, type: 'static', description: 'Hold the body horizontally from a vertical support using opposing arm forces.', checkpoints: ['Keep the support secure', 'Brace the trunk', 'Enter and exit under control'], analysisSupport: 'manual', safety: ['Advanced skill; use a stable purpose-built apparatus'] },
    ],
  },
  {
    category: 'rings',
    categoryName: 'Rings',
    equipment: ['Rings'],
    entries: [
      { name: 'Ring Muscle-up', level: 4, type: 'dynamic', description: 'Transition from a ring hang to support above the rings with controlled turnover.', checkpoints: ['Keep rings close', 'Pull high before turnover', 'Stabilize support'], analysisSupport: 'manual', safety: ['Set rings securely and verify strap height'] },
      { name: 'Iron Cross', level: 5, type: 'static', description: 'An extreme straight-arm ring support with the arms held laterally at shoulder height.', checkpoints: ['Develop ring support gradually', 'Keep elbows safely extended', 'Avoid sudden loading'], analysisSupport: 'manual', safety: ['Extreme tendon and shoulder loading; expert coaching required'] },
      { name: 'Ring Support Hold', level: 1, type: 'static', description: 'Hold a stable support above rings with the rings turned out as strength allows.', checkpoints: ['Keep rings close to the body', 'Depress shoulders', 'Begin with a safe duration'], analysisSupport: 'manual', safety: ['Check straps, anchors and rings before use'] },
    ],
  },
  {
    category: 'floorwork',
    categoryName: 'Floorwork & transitions',
    equipment: ['Floor'],
    entries: [
      { name: 'Elbow Lever', level: 2, type: 'static', description: 'Balance horizontally with the abdomen supported on the elbows and hands grounded.', checkpoints: ['Place elbows securely', 'Shift weight gradually', 'Use a soft landing area'], analysisSupport: 'manual' },
      { name: 'Elbow Lever to Handstand', level: 5, type: 'dynamic', description: 'Transition from elbow lever into handstand through a controlled press.', checkpoints: ['Master each position independently', 'Control wrist and shoulder loading', 'Plan an exit'], analysisSupport: 'manual', safety: ['Highly advanced transition; use appropriate coaching'] },
      { name: 'Backflip', level: 5, type: 'information', description: 'A dynamic aerial skill requiring dedicated coaching, suitable mats and progressive preparation.', checkpoints: ['Learn with a qualified coach', 'Use appropriate mats and spotting', 'Do not attempt from written instructions alone'], analysisSupport: 'manual', safety: ['High-risk aerial skill; requires in-person coaching and suitable landing setup'] },
      { name: 'Freestyle Transitions', level: 3, type: 'transition', description: 'A practice category for linking individually mastered static and dynamic skills.', checkpoints: ['Choose compatible skills', 'Keep transitions deliberate', 'Allow recovery and safe exits'], analysisSupport: 'manual', safety: ['Do not link skills beyond current control'] },
      { name: 'Floorwork', level: 1, type: 'transition', description: 'A general category for ground-based movement, support transitions and controlled shapes.', checkpoints: ['Use a clear non-slip surface', 'Move within comfortable ranges', 'Practice transitions separately first'], analysisSupport: 'manual' },
      { name: 'Back Lever Progression', level: 2, type: 'static', description: 'A grouped entry point for selecting an appropriate tuck or assisted back-lever variation.', checkpoints: ['Choose a manageable shape', 'Keep shoulders controlled', 'Exit before fatigue'], analysisSupport: 'manual', equipment: ['Rings', 'Bar'] },
    ],
  },
  {
    category: 'dynamic-skills',
    categoryName: 'Skill information',
    equipment: ['Varies by skill'],
    entries: [
      { name: 'Backflip Progression', level: 4, type: 'information', description: 'Information and planning entry for staged aerial-skill preparation; it is not a camera-analysis target.', checkpoints: ['Work with a qualified coach', 'Use suitable mats and spotting', 'Build prerequisites progressively'], analysisSupport: 'manual', safety: ['Aerial skills carry fall risk and require in-person instruction'] },
    ],
  },
]

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const extendedSkills: Skill[] = groups.flatMap((group) => {
  const entries = group.entries.map((entry) => ({
    ...entry,
    id: `${group.category}-${slug(entry.name)}`,
  }))
  return entries.map((entry) => {
    const easier = entries.filter((candidate) => candidate.level < entry.level).sort((a, b) => b.level - a.level)[0]
    const harder = entries.filter((candidate) => candidate.level > entry.level).sort((a, b) => a.level - b.level)[0]
    const exceptional = entry.name.includes('One-Arm') || entry.name.includes('Maltese') || entry.name === 'Iron Cross' || entry.name === 'Manna' || entry.name === 'Backflip'
    return {
      id: entry.id,
      name: entry.name,
      category: group.category,
      categoryName: entry.categoryName ?? group.categoryName,
      level: entry.level,
      type: entry.type,
      description: entry.description,
      checkpoints: entry.checkpoints,
      camera: entry.camera ?? 'Camera view is for reference only; this skill is not reliably evaluated by the current pose analyzer.',
      cues: entry.checkpoints,
      analysisSupport: entry.analysisSupport ?? 'manual',
      equipment: entry.equipment ?? group.equipment,
      prerequisites: entry.prerequisites ?? (easier ? [easier.name] : ['Comfortable, pain-free foundational strength and control']),
      regressions: easier ? [easier.name] : ['Use a supported or reduced-range variation'],
      progressions: harder ? [harder.name] : [],
      commonErrors: entry.commonErrors ?? ['Progressing before the position is controlled', 'Using momentum or range that cannot be maintained'],
      drills: easier ? [`Build time and control in ${easier.name}`] : ['Practice controlled entries, holds and exits separately'],
      safety: entry.safety ?? ['Use stable equipment and a clear practice area', 'Stop if you feel sharp pain or lose control'],
      relatedSkillIds: [easier?.id, harder?.id].filter((id): id is string => Boolean(id)),
      ...(exceptional ? { difficultyTag: 'Extreme' } : {}),
    } satisfies Skill
  })
})
