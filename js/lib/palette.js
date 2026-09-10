// CRABDEN - material library.
//
// Every material is a ramp of 7-9 colours running shadow -> light, plus the
// handful of numbers the shader in render/pixel.js needs. Keeping them here
// means the whole game shares one lighting language: a leaf and a claw are lit
// by the same sun and sit in the same desert.

const M = {};
const def = (name, ramp, props = {}) => {
  M[name] = {
    ramp,
    diffuse: 0.78, rim: 0.3, ao: 0.09, spec: 0, normalScale: 0.55,
    outline: ramp[0], ...props,
  };
};

// -- crab -------------------------------------------------------------------
def('chitin', ['#2b1a17', '#4a2a22', '#6d4030', '#8f5a3c', '#ad754b', '#c8925f', '#dfb37c', '#f0d2a0'],
  { rim: 0.4, spec: 0.35, ao: 0.12 });
def('chitinDark', ['#1d1210', '#33201b', '#4e3123', '#68432c', '#835a3a', '#9d7249', '#b78e60', '#d0aa7d'],
  { rim: 0.34, spec: 0.28 });
def('chitinPale', ['#3a2b22', '#5c4432', '#7d6044', '#9c7d58', '#b9996f', '#d2b48a', '#e6cca8', '#f6e4c8'],
  { rim: 0.42, spec: 0.3 });
def('shellRock', ['#33291f', '#4d3d2c', '#6b563d', '#877051', '#a18a68', '#b9a382', '#cfbc9e', '#e4d5bd'],
  { rim: 0.26, spec: 0.08, ao: 0.14, normalScale: 0.7 });
def('claw', ['#2a1a15', '#48291f', '#6b402c', '#8d5a3a', '#ab7650', '#c5946a', '#dcb289', '#efd2ae'],
  { rim: 0.45, spec: 0.45 });
def('flesh', ['#3a1a18', '#5c2622', '#7e3730', '#9d4a40', '#b76054', '#cd7a6c', '#df9789', '#eeb5a8'],
  { rim: 0.3, spec: 0.18 });
def('eye', ['#08060a', '#120d14', '#1d1520', '#2c2130', '#463349', '#6b5070', '#a08aa6', '#f4f0f6'],
  { rim: 0.7, spec: 0.9, diffuse: 0.5 });
def('eyeball', ['#4a3b2e', '#6b5643', '#8c7359', '#ab9070', '#c5ac8b', '#dbc6a8', '#ecdcc4', '#fbf3e4'],
  { rim: 0.55, spec: 0.85, diffuse: 0.6 });

// -- organics ---------------------------------------------------------------
def('leaf', ['#132414', '#1e3a1d', '#2c5527', '#3d7233', '#4f8f3e', '#68a94f', '#8cc468', '#b6de8f'],
  { rim: 0.26, translucent: 0.3, ao: 0.1, normalScale: 0.5 });
def('leafDry', ['#241d10', '#3a3018', '#544521', '#6f5b2c', '#8a7338', '#a58e4a', '#bfa963', '#d8c68a'],
  { rim: 0.24, translucent: 0.22 });
def('leafBlue', ['#0f2222', '#173536', '#214e4c', '#2d6a64', '#3c877c', '#52a496', '#74c0b1', '#a3dccf'],
  { rim: 0.3, translucent: 0.28 });
def('moss', ['#16220f', '#243318', '#354924', '#486131', '#5c7a3f', '#739450', '#8fae66', '#b0c88a'],
  { rim: 0.18, ao: 0.14, normalScale: 0.4 });
def('wood', ['#1c130c', '#2f2113', '#45311c', '#5b4326', '#725632', '#8a6c42', '#a48657', '#bfa374'],
  { rim: 0.24, ao: 0.13, normalScale: 0.75 });
def('woodPale', ['#2a2118', '#413424', '#5b4b34', '#766345', '#907c58', '#a9976f', '#c2b28d', '#dacdaf'],
  { rim: 0.24, ao: 0.12 });
def('petalPink', ['#3d1223', '#5e1c33', '#822844', '#a53757', '#c34d6c', '#da6884', '#ea8ba1', '#f7b3c2'],
  { rim: 0.4, translucent: 0.42, spec: 0.12 });
def('petalGold', ['#43290a', '#664112', '#8b5c19', '#b07a22', '#cd9930', '#e2b74a', '#f0d071', '#fbe6a4'],
  { rim: 0.4, translucent: 0.45 });
def('petalWhite', ['#3b3a3a', '#575552', '#736f68', '#8f8a80', '#aaa599', '#c5c0b3', '#dedace', '#f6f4ee'],
  { rim: 0.42, translucent: 0.5 });
def('berry', ['#2d0713', '#4b0d1e', '#6c142a', '#8d1c37', '#ad2946', '#c8425c', '#dc6379', '#ee8f9f'],
  { rim: 0.5, spec: 0.55 });
def('fruitGold', ['#40260a', '#5f3a0e', '#815115', '#a56b1d', '#c48a2c', '#dda944', '#eec66c', '#fae19f'],
  { rim: 0.45, spec: 0.4 });

// -- ground -----------------------------------------------------------------
def('sand', ['#54371f', '#6d492a', '#8a5f38', '#a67848', '#bd9159', '#d0a96e', '#e0c188', '#eed7a8'],
  { rim: 0.12, ao: 0.06, diffuse: 0.7, normalScale: 0.35 });
def('sandPale', ['#6a4c2c', '#85623a', '#a17b4a', '#b9945c', '#cead72', '#dfc48c', '#ecd7a8', '#f7e9c8'],
  { rim: 0.1, ao: 0.05, diffuse: 0.68 });
def('rock', ['#241d18', '#3a2f26', '#524237', '#6b5849', '#846f5d', '#9d8974', '#b5a48f', '#cec0ae'],
  { rim: 0.2, ao: 0.16, normalScale: 0.8 });
def('rockRed', ['#2c1610', '#48241a', '#653526', '#814734', '#9c5c45', '#b4755b', '#c99177', '#dcb098'],
  { rim: 0.2, ao: 0.16, normalScale: 0.8 });
def('bone', ['#3c362a', '#585141', '#746c58', '#918870', '#ada48b', '#c6bea7', '#ddd6c3', '#f2ecdd'],
  { rim: 0.3, ao: 0.13, spec: 0.1 });
def('rust', ['#2a1409', '#452110', '#63301a', '#7f4324', '#985a33', '#ae7448', '#c39163', '#d6b189'],
  { rim: 0.22, ao: 0.15, normalScale: 0.9 });

// -- water ------------------------------------------------------------------
def('water', ['#0b2a34', '#0f3b49', '#155062', '#1c6a80', '#25889f', '#37a7bd', '#5fc6d8', '#9de3ee'],
  { rim: 0.55, spec: 0.8, diffuse: 0.55, ao: 0.05, translucent: 0.3 });
def('waterFoam', ['#2b5560', '#3d6f7c', '#528b98', '#69a6b3', '#84c0cb', '#a2d8e0', '#c4ecf1', '#eafbfd'],
  { rim: 0.5, spec: 0.6 });
def('ice', ['#1b3944', '#27505e', '#356b7c', '#468799', '#5da3b4', '#7cc0ce', '#a4dbe4', '#d3f2f7'],
  { rim: 0.6, spec: 0.85, translucent: 0.4 });

// -- creatures --------------------------------------------------------------
def('fur', ['#241a12', '#3b2b1d', '#543e2a', '#6e5438', '#886c48', '#a3865c', '#bda175', '#d7bf98'],
  { rim: 0.34, ao: 0.11, normalScale: 0.45, diffuse: 0.72 });
def('furPale', ['#3a3125', '#544937', '#6f624b', '#8a7c61', '#a49778', '#bdb193', '#d5cbb1', '#ece5d2'],
  { rim: 0.38, ao: 0.1 });
def('furRed', ['#2e150e', '#4a2214', '#67321c', '#844527', '#9d5b35', '#b57547', '#cb925f', '#deb182'],
  { rim: 0.34, ao: 0.11 });
def('feather', ['#2b241a', '#443a29', '#5f5138', '#7a6a49', '#95845c', '#ae9e74', '#c6b891', '#ded3b4'],
  { rim: 0.4, ao: 0.1, normalScale: 0.6 });
def('scaleGreen', ['#14200f', '#20331a', '#2f4a26', '#416334', '#547d44', '#6c9758', '#8ab273', '#aecd97'],
  { rim: 0.36, spec: 0.3, normalScale: 0.7 });
def('scaleRed', ['#2c0d0a', '#4a1611', '#6c231a', '#8c3324', '#a94733', '#c26146', '#d68062', '#e7a488'],
  { rim: 0.4, spec: 0.35, normalScale: 0.7 });
def('scaleSand', ['#3a2c19', '#564126', '#735834', '#8e7144', '#a78b58', '#bfa571', '#d4bf90', '#e8d8b5'],
  { rim: 0.36, spec: 0.28, normalScale: 0.7 });
def('carapace', ['#1a1d22', '#2a2f37', '#3d434e', '#525a67', '#697280', '#828c9a', '#9ea7b4', '#bcc4cf'],
  { rim: 0.5, spec: 0.5, normalScale: 0.75 });
def('carapaceBone', ['#403a2e', '#5c5546', '#7a7160', '#978d79', '#b1a894', '#c8c0ae', '#dcd6c7', '#f0ece1'],
  { rim: 0.42, spec: 0.28, normalScale: 0.75 });
def('membrane', ['#3a1e22', '#552b31', '#733c43', '#8e4e57', '#a5646d', '#ba7d85', '#cd9ba2', '#e0bec3'],
  { rim: 0.5, translucent: 0.55, spec: 0.2 });
def('horn', ['#2a2318', '#413827', '#5b5038', '#766a4b', '#8f8460', '#a99e78', '#c2b795', '#dad2b7'],
  { rim: 0.38, spec: 0.3, normalScale: 0.8 });

// -- the inside of you ------------------------------------------------------
// Seen only on the anatomy screen, lit by your own bioluminescence rather than
// by the sun, so these ramps run cooler and carry more rim than flesh does.
def('organ', ['#2a0d14', '#451420', '#631e2d', '#80293c', '#9c3a4e', '#b55164', '#cb6e7e', '#dd9099'],
  { rim: 0.46, spec: 0.3, translucent: 0.34, ao: 0.13 });
def('organPale', ['#3a2028', '#553039', '#72434d', '#8d5862', '#a67079', '#bd8b92', '#d1a8ad', '#e4c6c9'],
  { rim: 0.44, spec: 0.24, translucent: 0.4 });
def('gill', ['#0f2430', '#163544', '#1f4a5c', '#2b6375', '#397e8f', '#4c9aa9', '#69b7c3', '#94d6de'],
  { rim: 0.56, spec: 0.4, translucent: 0.5, normalScale: 0.5 });
def('nerve', ['#12301f', '#1a4a2c', '#22683a', '#2c8a48', '#3aac57', '#55c96f', '#82e295', '#bdf5c8'],
  { rim: 0.6, spec: 0.4, diffuse: 0.5, translucent: 0.45 });
def('nacre', ['#2c2b33', '#414353', '#585d72', '#727890', '#8d94ab', '#a9b0c4', '#c6ccda', '#e6eaf1'],
  { rim: 0.7, spec: 0.85, translucent: 0.3, normalScale: 0.6 });
def('sap', ['#123122', '#1a4c31', '#246b41', '#308d52', '#3fae64', '#5bcb7e', '#86e3a2', '#c3f7d3'],
  { rim: 0.62, spec: 0.5, diffuse: 0.42 });
def('seedcoat', ['#2b2313', '#43371c', '#5e4d27', '#7a6533', '#957e42', '#b09955', '#c8b473', '#dfd09b'],
  { rim: 0.4, spec: 0.3, normalScale: 0.8 });

// -- structures -------------------------------------------------------------
def('rope', ['#33270f', '#4c3a19', '#675024', '#816632', '#9a7d43', '#b09458', '#c5ac72', '#d8c495'],
  { rim: 0.24, normalScale: 0.9 });
def('cloth', ['#3c2418', '#573528', '#734a37', '#8d6048', '#a5785c', '#bb9174', '#cfab90', '#e2c6b0'],
  { rim: 0.3, ao: 0.1 });
def('metal', ['#181a1e', '#282c33', '#3c424b', '#525a66', '#6b7480', '#87919d', '#a5aeb9', '#c6ccd4'],
  { rim: 0.6, spec: 0.75, normalScale: 0.8 });
def('glass', ['#16282c', '#1f3b42', '#2c5259', '#3b6b73', '#4d868e', '#66a2aa', '#8bc0c6', '#bfe0e4'],
  { rim: 0.7, spec: 0.9, translucent: 0.5 });
def('glow', ['#3a2a10', '#5f4413', '#8a6318', '#b5851f', '#d7a92c', '#eeca47', '#fae57e', '#fff6c4'],
  { rim: 0.6, spec: 0.5, diffuse: 0.4 });

// -- human ------------------------------------------------------------------
def('skin', ['#3a2018', '#563025', '#734334', '#8e5843', '#a86f56', '#bf886d', '#d3a488', '#e6c3aa'],
  { rim: 0.32, spec: 0.14 });
def('khaki', ['#3a3626', '#514c35', '#6a6446', '#847c57', '#9c946b', '#b3ac83', '#c9c39e', '#ded9bd'],
  { rim: 0.26, ao: 0.1 });
def('leather', ['#2a1a10', '#412819', '#5b3a24', '#754e31', '#8e6440', '#a67c53', '#bc966c', '#d0b18c'],
  { rim: 0.3, spec: 0.2 });
def('canvasBag', ['#332b1c', '#4a4029', '#645738', '#7e7048', '#968959', '#ada370', '#c3bb8d', '#d8d2ae'],
  { rim: 0.24 });

def('default', ['#1a1a1a', '#333', '#4d4d4d', '#666', '#808080', '#999', '#b3b3b3', '#ccc']);

export const MATERIALS = M;

/** Shift a whole ramp toward a colour - used for variant tinting. */
export function tintRamp(name, hex, amount) {
  const base = M[name];
  const [r, g, b] = hexToRgbLocal(hex);
  return {
    ...base,
    ramp: base.ramp.map((c) => {
      const [cr, cg, cb] = hexToRgbLocal(c);
      const mix = (a, b2) => Math.round(a + (b2 - a) * amount);
      return rgbToHexLocal(mix(cr, r), mix(cg, g), mix(cb, b));
    }),
  };
}

function hexToRgbLocal(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHexLocal(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** A palette with extra materials merged in, for one-off creatures. */
export function withMaterials(extra) {
  return { ...M, ...extra };
}
