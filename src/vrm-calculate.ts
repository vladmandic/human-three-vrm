import * as THREE from 'three';
import { VRMSchema } from '@pixiv/three-vrm'; // npm package <https://github.com/pixiv/three-vrm>

// shared variables
let leanBody = 0; // face angle is relative to body
let posLeftWrist; // hand model needs to know which body hand is closest
let posRightWrist; // hand model needs to know which body hand is closest

const angle = (pt1, pt2) => {
  if (!pt1 || !pt2 || pt1.length < 2 || pt2.length < 2) return 0;
  const radians = Math.atan2(pt2[1] - pt1[1], pt2[0] - pt1[0]);
  return radians;
};

async function updateBody(vrm, res) {
  const body = (res && res.body) ? res.body[0] : null;
  if (!body) return;
  const part = (what) => {
    const found = body.keypoints.find((a) => a.part === what);
    const pos = found ? found.positionRaw : null;
    return pos;
  };
  // lean body
  const posLeftShoulder = part('leftShoulder');
  const posRightShoulder = part('rightShoulder');
  leanBody = angle(posRightShoulder, posLeftShoulder);
  if (posLeftShoulder && posRightShoulder) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.z = leanBody;

  // arms
  const posRightElbow = part('rightElbow');
  if (posRightShoulder && posRightElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.y = angle(posRightElbow, posRightShoulder);
  const posLeftElbow = part('leftElbow');
  if (posLeftShoulder && posLeftElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftUpperArm).rotation.y = angle(posLeftShoulder, posLeftElbow);

  // elbows
  posRightWrist = part('rightWrist');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightLowerArm).rotation.y = (posRightWrist && posRightElbow && posRightShoulder) ? angle(posRightWrist, posRightElbow) - angle(posRightElbow, posRightShoulder) : 0;
  posLeftWrist = part('leftWrist');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftLowerArm).rotation.y = (posLeftWrist && posLeftElbow) ? angle(posLeftElbow, posLeftWrist) - angle(posLeftShoulder, posLeftElbow) : 0;

  // legs
  const posRightHip = part('rightHip');
  const posRightKnee = part('rightKnee');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperLeg).rotation.z = (posRightHip && posRightKnee) ? angle(posRightHip, posRightKnee) - (Math.PI / 2) : 0;
  const posLeftHip = part('leftHip');
  const posLeftKnee = part('leftKnee');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftUpperLeg).rotation.z = (posLeftHip && posLeftKnee) ? angle(posLeftHip, posLeftKnee) - (Math.PI / 2) : 0;

  // knees
  /*
  const posRightAnkle = part('rightAnkle');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightLowerLeg).rotation.z = (posRightHip && posRightAnkle) ? angle(posRightHip, posRightAnkle) - (Math.PI / 2) : 0;
  const posLeftAnkle = part('leftAnkle');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftLowerLeg).rotation.z = (posLeftHip && posLeftAnkle) ? angle(posLeftHip, posLeftAnkle) - (Math.PI / 2) : 0;
  */
}

async function updateHands(vrm, res) {
  const hands = (res && res.hand) ? res.hand : [];
  for (const hand of hands) {
    const distanceLeft = posLeftWrist ? Math.sqrt((hand.boxRaw[0] - posLeftWrist[0]) ** 2) + ((hand.boxRaw[1] - posLeftWrist[1]) ** 2) : Number.MAX_VALUE;
    const distanceRight = posRightWrist ? Math.sqrt((hand.boxRaw[0] - posRightWrist[0]) ** 2) + ((hand.boxRaw[1] - posRightWrist[1]) ** 2) : Number.MAX_VALUE;
    if (distanceLeft > 1 && distanceRight > 1) continue; // both hands are too far
    const left = distanceLeft < distanceRight;

    const handSize = Math.sqrt(((hand.box[2] || 1) ** 2) + (hand.box[3] || 1) ** 2) / Math.PI;
    const handRotation = (hand.annotations.pinky[0][2] - hand.annotations.thumb[0][2]) / handSize; // normalized z-coord of root of pinky and thumb fingers
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftHand' : 'RightHand']).rotation.z = -handRotation * Math.PI / 2; // rotate palm towards camera

    // finger curls
    const getCurl = (finger) => {
      let val = 0;
      if (hand.landmarks[finger].curl === 'half') val = Math.PI / 8;
      else if (hand.landmarks[finger].curl === 'full') val = Math.PI / 4;
      return val;
    };

    let val;
    val = getCurl('index');
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}IndexIntermediate`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}IndexProximal`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}IndexDistal`]).rotation.z = val;
    val = getCurl('middle');
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}MiddleIntermediate`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}MiddleProximal`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}MiddleDistal`]).rotation.z = val;
    val = getCurl('ring');
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}RingIntermediate`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}RingProximal`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}RingDistal`]).rotation.z = val;
    val = getCurl('pinky');
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}LittleIntermediate`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}LittleProximal`]).rotation.z = val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}LittleDistal`]).rotation.z = val;
    val = getCurl('thumb');
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}ThumbIntermediate`]).rotation.x = 2 * -val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}ThumbProximal`]).rotation.x = 2 * -val;
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}ThumbDistal`]).rotation.x = 2 * -val;

    // palm wave
    const q = angle(hand.annotations.index[3], hand.annotations.palm[0]) - (Math.PI / 2);
    vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[`${left ? 'Left' : 'Right'}Hand`]).rotation.y = q;
  }
}

async function updateFace(vrm, res) {
  const face = (res && res.face) ? res.face[0] : null;
  if (!face) return;
  // face angles
  const faceAngle = face.rotation?.angle || { roll: 0, yaw: 0, pitch: 0 };
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.x = -faceAngle.pitch / 2;
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.y = -faceAngle.yaw / 2;
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.z = faceAngle.roll / 2 - leanBody;
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.x = -faceAngle.pitch / 2;
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.y = -faceAngle.yaw / 2;
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.z = (faceAngle.roll / 2 - leanBody) / 2;
  // eye blinks
  if (face.mesh.length > 300) {
    const blinkL = 3 * (Math.abs(face.mesh[374][1] - face.mesh[386][1]) / Math.abs(face.mesh[443][1] - face.mesh[450][1]) - 0.15); // center of eye inner lid y coord div center of wider eye border y coord
    const blinkR = 3 * (Math.abs(face.mesh[145][1] - face.mesh[159][1]) / Math.abs(face.mesh[223][1] - face.mesh[230][1]) - 0.15); // center of eye inner lid y coord div center of wider eye border y coord
    vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.BlinkL, 1 - blinkL);
    vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.BlinkR, 1 - blinkR);
  }
  // emotion reset
  vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Fun, 0);
  vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Angry, 0);
  vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Sorrow, 0);
  vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Neutral, 0);
  // emotion set
  const emotion = face.emotion?.reduce((prev, curr) => (prev.score > curr.score ? prev : curr));
  switch (emotion?.emotion || '') {
    case 'happy': vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Fun, 1); break;
    case 'angry': vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Angry, 1); break;
    case 'sad': vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Sorrow, 1); break;
    default: vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Neutral, 1);
  }
  // mouth open
  if (face.mesh.length > 300) {
    const mouth = Math.min(1, 5 * Math.abs(face.mesh[13][1] - face.mesh[14][1]) / Math.abs(face.mesh[10][1] - face.mesh[152][1]));
    vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.O, mouth);
  }
  // eye gaze direction
  const gaze = face.rotation?.gaze;
  if (gaze) {
    const target = new THREE.Object3D();
    if (gaze) target.position.x = 10 * gaze.strength * Math.sin(gaze.bearing);
    if (gaze) target.position.y = 10 * gaze.strength * Math.cos(gaze.bearing);
    vrm.lookAt.target = target;
  }
}

export async function update(vrm, res) {
  if (!vrm || !vrm.humanoid) return;
  await updateBody(vrm, res);
  await updateFace(vrm, res);
  await updateHands(vrm, res);
}
