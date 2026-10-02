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
def('shellRock', ['#26221f', '#3a342e', '#524a42', '#6b6157', '#857a6d', '#9f9384', '#b8ad9c', '#d2c9b8'],
  { rim: 0.26, spec: 0.08, ao: 0.14, normalScale: 0.7 });
// a real crab's shell: deep brick red, granular, going orange on the lit edge
def('crabShell', ['#1f0d0a', '#3a1610', '#572116', '#77301d', '#954327', '#b05c33', '#c97c49', '#e0a36b'],
  { rim: 0.42, spec: 0.38, ao: 0.14 });
def('crabShellDark', ['#170a08', '#2b120d', '#421a12', '#5b2618', '#753520', '#8d4829', '#a6623a', '#bf8255'],
  { rim: 0.34, spec: 0.3 });
def('crabBelly', ['#3a261c', '#5c3e2c', '#7e5a40', '#9f7956', '#bc9870', '#d4b48c', '#e6cdaa', '#f4e4cc'],
  { rim: 0.3, spec: 0.2 });
// a whelk shell: olive grey-green, glossy, with a pearly sheen where it is worn
def('conch', ['#1d221d', '#30382f', '#465042', '#5d6956', '#76826b', '#909c82', '#aeb89c', '#cdd4bc'],
  { rim: 0.36, spec: 0.55, ao: 0.14, normalScale: 0.7 });
def('conchPearl', ['#36303a', '#524a55', '#706672', '#8e8590', '#aca4ac', '#c8c2c6', '#e0dcdc', '#f4f2ee'],
  { rim: 0.5, spec: 0.75, ao: 0.08 });
// the animal in it: orange-red, granular, every bump tipped pale
def('hermitRed', ['#2a0c08', '#4a140c', '#6e1e10', '#932c16', '#b4401e', '#cf5a2a', '#e47c42', '#f3a466'],
  { rim: 0.4, spec: 0.32, ao: 0.14 });
def('hermitDark', ['#1e0806', '#360e09', '#52160d', '#701f12', '#8c2e18', '#a64220', '#bd5c30', '#d27e48'],
  { rim: 0.34, spec: 0.26 });
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
def('copper', ['#2e1206', '#4e200c', '#803818', '#a84c22', '#c0602c', '#e07a3c', '#f0904c', '#ffd8b0'],
  { rim: 0.6, spec: 0.8, normalScale: 0.8 });
def('verdigris', ['#0e2a22', '#164036', '#1e5a48', '#2e8a6a', '#43a882', '#5ec8a0', '#8ae0bc', '#b8f0d0'],
  { rim: 0.3, ao: 0.12, normalScale: 0.6 });
def('amber', ['#3a1a04', '#5e2a06', '#a04e0c', '#c86c12', '#e08a18', '#f4aa30', '#ffc840', '#fff3b0'],
  { rim: 0.7, spec: 0.85, translucent: 0.5, diffuse: 0.45 });
def('lichen', ['#3a2406', '#5e3a0a', '#8a5410', '#b27018', '#d08c24', '#e8aa3a', '#f4c860', '#fbe39a'],
  { rim: 0.18, ao: 0.12, normalScale: 0.5 });
def('crystal', ['#0e1f2c', '#163246', '#1f4a62', '#2a6880', '#3a8aa0', '#56aec0', '#86d4dc', '#d0f6f6'],
  { rim: 0.75, spec: 0.9, translucent: 0.45, normalScale: 0.9 });
def('glowTeal', ['#0e4044', '#1a7a72', '#2ec0a8', '#5fe0c8', '#7ff0d0', '#aaf8e4', '#d8fff4', '#ffffff'],
  { rim: 0.3, diffuse: 0.35, noOutline: false });
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

// -- the spore organ --------------------------------------------------------
// A violet that is deliberately the one cold colour in a hot palette - the
// gland does not belong in this desert and is not supposed to look like it
// does.
def('spore', ['#1b0c25', '#2d1339', '#431b52', '#5b256c', '#763687', '#9450a4', '#b473c2', '#d5a3dd'],
  { rim: 0.55, spec: 0.4, translucent: 0.35 });
def('sporeSac', ['#241228', '#3a1c3e', '#532a55', '#6d3a6c', '#874f84', '#a2699c', '#bc8ab5', '#d6b0cd'],
  { rim: 0.45, spec: 0.3, translucent: 0.5 });

// -- the wasteland backdrop -------------------------------------------------
// Distant rock, ruin and wreck. They are seen through a lot of air, so the
// ramps are a little wider than the near ones - the haze takes contrast off
// them on the way to the eye, and what is left still has to read.
def('wlMesaRed', ['#2a1420', '#432029', '#5e2b2b', '#7e3a2c', '#9d4f31', '#b9693d', '#d08a52', '#e4b077'],
  { rim: 0.12, ao: 0.1, normalScale: 0.75 });
// distant sands, with the shadows pulled toward violet the way shade out
// here is lit by the sky rather than by the ground
def('wlDune', ['#41282c', '#5e3a35', '#7d5040', '#9c6a4c', '#b8865a', '#cfa26c', '#e2bf86', '#f0d9a8'],
  { rim: 0.08, ao: 0.06, diffuse: 0.7, normalScale: 0.4 });
def('wlDunePale', ['#5a4642', '#776058', '#937b6c', '#ad9680', '#c4af94', '#d8c6aa', '#e8dac2', '#f5eedc'],
  { rim: 0.08, ao: 0.06, diffuse: 0.68, normalScale: 0.4 });
def('wlMesaBand', ['#3a2016', '#5a3322', '#7a4a32', '#9a6444', '#b67f58', '#cc9a70', '#ddb68c', '#ecd2ae'],
  { rim: 0.12, ao: 0.1, normalScale: 0.75 });
def('wlSalt', ['#4c463f', '#665e54', '#81786b', '#9b9283', '#b4ab9b', '#cac2b3', '#ddd7ca', '#efebe2'],
  { rim: 0.1, ao: 0.08, normalScale: 0.7 });
def('wlMesaGrey', ['#1d1b20', '#2d2a31', '#403c45', '#55505b', '#6b6672', '#837e8a', '#9e99a5', '#bcb8c2'],
  { rim: 0.12, ao: 0.1, normalScale: 0.8 });
def('wlMesaAsh', ['#1a1518', '#291f25', '#3a2d35', '#4d3d47', '#62505b', '#796571', '#927e8a', '#ae9ba6'],
  { rim: 0.12, ao: 0.1, normalScale: 0.8 });
def('wlMesaDeep', ['#0c1317', '#142025', '#1d2f36', '#284048', '#34535c', '#436872', '#58808a', '#769ea5'],
  { rim: 0.12, ao: 0.1, normalScale: 0.8 });
def('wlRust', ['#1c0c07', '#33160c', '#4f2212', '#6b2f19', '#874022', '#a0552d', '#b86f3e', '#cc8f58'],
  { rim: 0.2, ao: 0.12, normalScale: 0.85 });
def('wlConcrete', ['#211f1d', '#33302c', '#46423d', '#5b5650', '#716b64', '#88827a', '#a19b92', '#bab5ac'],
  { rim: 0.14, ao: 0.1, normalScale: 0.8 });
def('wlDeadwood', ['#1b1613', '#2c241f', '#3e332b', '#524439', '#665749', '#7c6c5c', '#958572', '#b0a18d'],
  { rim: 0.2, ao: 0.1, normalScale: 0.7 });
def('wlCharcoal', ['#0b090a', '#141112', '#1d191a', '#272223', '#332d2e', '#403939', '#4f4747', '#615858'],
  { rim: 0.2, ao: 0.1, normalScale: 0.7 });
def('wlSaltCrust', ['#655e55', '#7f776c', '#999185', '#b1aa9d', '#c7c1b5', '#d9d4ca', '#e8e5de', '#f6f4ef'],
  { rim: 0.08, ao: 0.05, diffuse: 0.66, normalScale: 0.4 });
def('wlAshSand', ['#201a1a', '#312827', '#433836', '#574a46', '#6c5d57', '#82726a', '#9a8a80', '#b4a49a'],
  { rim: 0.1, ao: 0.06, diffuse: 0.68, normalScale: 0.4 });
def('wlHardpan', ['#3e2a1a', '#523823', '#67482e', '#7c5a3a', '#906b47', '#a37d56', '#b59068', '#c6a47e'],
  { rim: 0.08, ao: 0.08, diffuse: 0.66, normalScale: 0.5 });
// -- desert stone -----------------------------------------------------------
// Real rock is never one colour. These ramps run cool in the shadow and warm
// in the light, the way stone does under a desert sun with blue sky filling
// the shade, so a boulder reads as lit form rather than as a brown blob.
def('sandstone', ['#1e0f0e', '#341915', '#4f251b', '#6c3322', '#89452b', '#a35a36', '#b97344', '#cc8f58',
  '#ddac74', '#ecca98'], { rim: 0.22, ao: 0.18, normalScale: 0.85, spec: 0.04 });
def('sandstoneBuff', ['#231a16', '#3b2c22', '#57422f', '#735a3f', '#8e7350', '#a78d64', '#bea67b', '#d1bd95',
  '#e2d3b2', '#f0e6cf'], { rim: 0.22, ao: 0.18, normalScale: 0.85, spec: 0.04 });
def('limestone', ['#1f1e24', '#333238', '#4a4849', '#62605d', '#7c7872', '#969188', '#afa99e', '#c6c0b4',
  '#dbd6cb', '#eeebe3'], { rim: 0.24, ao: 0.2, normalScale: 0.8, spec: 0.05 });
def('basalt', ['#0c0d11', '#15161b', '#1f2026', '#2a2b31', '#36363c', '#434249', '#524f56', '#635f65',
  '#77727a', '#8e8890'], { rim: 0.3, ao: 0.16, normalScale: 0.9, spec: 0.12 });
def('granite', ['#1c1819', '#2f2828', '#453b3a', '#5c504d', '#746662', '#8d7e78', '#a5968f', '#bbaea6',
  '#d0c5bd', '#e3dbd4'], { rim: 0.24, ao: 0.16, normalScale: 0.8, spec: 0.06 });
// the black-brown skin the desert paints on any face that has stood still
// for a few thousand years, glossy where the wind polished it
def('varnish', ['#0f0807', '#1b0f0b', '#281611', '#361f17', '#46291e', '#573427', '#6a4232', '#7f523f'],
  { rim: 0.3, ao: 0.12, normalScale: 0.85, spec: 0.35 });
def('lichenGreen', ['#20271c', '#323d2b', '#47543b', '#5e6c4c', '#768560', '#8f9d76', '#a9b58f', '#c4cdaa'],
  { rim: 0.16, ao: 0.1, normalScale: 0.4 });
def('lichenOrange', ['#2e1a0c', '#4a2a12', '#663b18', '#824e20', '#9c632c', '#b27a3c', '#c69352', '#d6ad6e'],
  { rim: 0.16, ao: 0.1, normalScale: 0.4 });
def('desertSand', ['#4a2f1b', '#654125', '#815631', '#9c6c3e', '#b4834e', '#c99b62', '#d9b37b', '#e6c995',
  '#f1ddb4'], { rim: 0.1, ao: 0.08, diffuse: 0.7, normalScale: 0.4 });

// -- ore --------------------------------------------------------------------
def('malachite', ['#061a14', '#0b2a1f', '#103d2c', '#16523a', '#1d6a4a', '#27845b', '#369e6e', '#4fb884',
  '#76d0a2', '#aee8c9'], { rim: 0.34, ao: 0.1, spec: 0.35, normalScale: 0.6 });
def('azurite', ['#09102a', '#0f1a43', '#16265e', '#1f357b', '#2a4797', '#3a5db2', '#5079c9', '#6e98dc',
  '#97bbec'], { rim: 0.4, spec: 0.5, normalScale: 0.6 });
def('hematite', ['#120a0b', '#1f1011', '#2f1716', '#40201c', '#532a23', '#67352a', '#7c4232', '#93523d',
  '#ab6a4f'], { rim: 0.5, spec: 0.65, normalScale: 0.85 });
def('jasper', ['#240a07', '#3d110b', '#59190f', '#762314', '#922f1a', '#ab3f22', '#c1542f', '#d46f43',
  '#e38f62'], { rim: 0.3, ao: 0.14, spec: 0.2, normalScale: 0.75 });
def('quartz', ['#2f363c', '#48525a', '#636f78', '#808c95', '#9eaab2', '#bac5cc', '#d3dce1', '#e8eef1',
  '#ffffff'], { rim: 0.65, spec: 0.95, translucent: 0.45, diffuse: 0.6, normalScale: 0.95 });
def('halite', ['#43393b', '#5f5355', '#7c6e6f', '#988a8a', '#b2a5a3', '#c9bebc', '#ddd4d2', '#eee9e7',
  '#ffffff'], { rim: 0.5, spec: 0.7, translucent: 0.35, normalScale: 0.8 });
def('brass', ['#2e1e05', '#4c330a', '#6f4c10', '#946917', '#b8881f', '#d4a72d', '#e9c44a', '#f7df7f',
  '#fff3bd'], { rim: 0.6, spec: 0.95, diffuse: 0.6, normalScale: 0.9 });
def('shale', ['#121011', '#1c191a', '#272223', '#332c2c', '#403736', '#4e4441', '#5d524e', '#6f625c',
  '#827469'], { rim: 0.22, ao: 0.16, normalScale: 0.85, spec: 0.08 });

// -- desert plants ----------------------------------------------------------
def('creosote', ['#12170b', '#1d2510', '#2a3515', '#38471b', '#475a22', '#586d2a', '#6c8034', '#829341',
  '#9ca854'], { rim: 0.22, translucent: 0.28, ao: 0.14, normalScale: 0.45 });
def('saltbush', ['#161b19', '#232b27', '#323d37', '#424f48', '#54625a', '#68776d', '#7e8c81', '#96a397',
  '#b2bcae'], { rim: 0.24, translucent: 0.2, ao: 0.14, normalScale: 0.45 });
def('twig', ['#1a1410', '#2a211a', '#3c3025', '#4f4031', '#62513f', '#76634f', '#8b7762', '#a18d78'],
  { rim: 0.22, ao: 0.12, normalScale: 0.7 });
def('straw', ['#271d0f', '#3d2f17', '#57441f', '#725b2a', '#8c7337', '#a58b46', '#bba359', '#cfba70',
  '#e1d092'], { rim: 0.26, translucent: 0.3, normalScale: 0.5 });
def('pear', ['#0d1c15', '#152a20', '#1d3a2c', '#264c39', '#305f47', '#3c7356', '#4b8767', '#5f9c7b',
  '#79b292', '#99c8ab'], { rim: 0.3, spec: 0.12, ao: 0.12, translucent: 0.12, normalScale: 0.55 });
def('cactus', ['#0c1a0f', '#132818', '#1a3820', '#224a29', '#2c5d33', '#38713e', '#47854a', '#5a9a59',
  '#73ae6c'], { rim: 0.3, spec: 0.14, ao: 0.14, normalScale: 0.6 });
def('spine', ['#3a2410', '#5c3a17', '#82561f', '#a7742b', '#c6943b', '#ddb352', '#ecce73', '#f7e5a0'],
  { rim: 0.4, spec: 0.3, normalScale: 0.5 });
def('agave', ['#121a20', '#1c2830', '#283841', '#354a54', '#445d67', '#55717b', '#68858e', '#7e99a1',
  '#98b0b5', '#b6c8ca'], { rim: 0.3, spec: 0.12, ao: 0.12, translucent: 0.1, normalScale: 0.55 });
def('ocotillo', ['#191812', '#28261c', '#3a3728', '#4c4934', '#5f5b42', '#736e51', '#888262', '#9d9776'],
  { rim: 0.24, ao: 0.1, normalScale: 0.6 });
def('bloomRed', ['#2e0806', '#4d0e0a', '#70160e', '#951f13', '#b72c19', '#d34024', '#e75e37', '#f58456'],
  { rim: 0.45, translucent: 0.4, spec: 0.2 });
def('fruitMagenta', ['#2a0716', '#470c24', '#661233', '#861a44', '#a42556', '#bf3669', '#d6507f', '#e97399'],
  { rim: 0.45, spec: 0.35 });

// -- the oasis --------------------------------------------------------------
def('palmLeaf', ['#08150c', '#0f2213', '#16311a', '#1e4121', '#285329', '#336631', '#41793a', '#518c43',
  '#669f4f', '#83b462'], { rim: 0.28, translucent: 0.36, ao: 0.1, normalScale: 0.5 });
def('palmDry', ['#1f150b', '#332211', '#4a3217', '#62441e', '#7a5727', '#926b33', '#a98042', '#bd9656',
  '#cfab6e'], { rim: 0.26, translucent: 0.25, normalScale: 0.6 });
def('palmBark', ['#17110d', '#261c15', '#36281d', '#473527', '#594332', '#6b523e', '#7e624c', '#91735c',
  '#a5866f'], { rim: 0.26, ao: 0.18, normalScale: 0.85 });
def('dates', ['#250d05', '#401508', '#5e1f0b', '#7e2c10', '#9c3d17', '#b75221', '#cd6b31', '#de8a48'],
  { rim: 0.45, spec: 0.45 });
def('reed', ['#0d1c0d', '#142a14', '#1c3b1b', '#254d23', '#2f612c', '#3b7535', '#4a8a40', '#5d9f4c',
  '#76b45e', '#94c878'], { rim: 0.26, translucent: 0.34, normalScale: 0.5 });
def('cattail', ['#180c07', '#28140b', '#3b1e10', '#4f2916', '#64351c', '#794324', '#8e532e', '#a2663c'],
  { rim: 0.3, ao: 0.12, normalScale: 0.6 });
def('lilypad', ['#0a1d14', '#0f2a1c', '#153a26', '#1c4b30', '#245d3b', '#2e7047', '#3b8354', '#4c9763'],
  { rim: 0.3, spec: 0.3, normalScale: 0.4 });

// -- the camp (js/art/campart.js) -------------------------------------------
// tent canvas eleven summers in the sun: cream on the lit face, a dusty
// khaki in the folds, never white
def('campCanvas', ['#2e261c', '#4a3e2e', '#685a44', '#87775b', '#a39373', '#bcae8c', '#d2c6a6', '#e4dcc0',
  '#f1ead4'], { rim: 0.22, ao: 0.12, normalScale: 0.6 });
// the madder-red trim and patches, faded to brick
def('campRed', ['#2a100c', '#441913', '#62241a', '#7e3222', '#97432c', '#ad5a3a', '#c0744e', '#d09068'],
  { rim: 0.24, ao: 0.1 });
// a wool blanket, deep oxblood
def('campWool', ['#1e0a0a', '#341010', '#4c1816', '#64211c', '#7c2d24', '#94402e', '#a9573c', '#bd7050'],
  { rim: 0.2, ao: 0.14, normalScale: 0.45 });
// the bed of a fire that has been lit every night for years
def('campAsh', ['#151210', '#221d1a', '#312b27', '#433b35', '#564d45', '#6b6157', '#81776b', '#988e80'],
  { rim: 0.12, ao: 0.16, normalScale: 0.5 });

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
