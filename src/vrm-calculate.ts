import * as THREE from 'three';
import { VRM, VRMHumanBone, VRMExpressionPresetName } from '@pixiv/three-vrm';
import type { Result } from '@vladmandic/human';

// shared variables
let leanBody = 0; // face angle is relative to body
let posLeftWrist; // hand model needs to know which body hand is closest
let posRightWrist; // hand model needs to know which body hand is closest

const angle = (pt1, pt2) => {
  if (!pt1 || !pt2 || pt1.length < 2 || pt2.length < 2) return 0;
  const radians = Math.atan2(pt2[1] - pt1[1], pt2[0] - pt1[0]);
  return radians;
};

async function updateBody(vrm: VRM, res: Result) {
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
  if (posLeftShoulder && posRightShoulder) (vrm.humanoid.getNormalizedBone('chest') as VRMHumanBone).node.rotation.z = leanBody;

  // arms
  const posRightElbow = part('rightElbow');
  if (posRightShoulder && posRightElbow) (vrm.humanoid.getNormalizedBone('rightUpperArm') as VRMHumanBone).node.rotation.y = angle(posRightElbow, posRightShoulder);
  const posLeftElbow = part('leftElbow');
  if (posLeftShoulder && posLeftElbow) (vrm.humanoid.getNormalizedBone('leftUpperArm') as VRMHumanBone).node.rotation.y = angle(posLeftShoulder, posLeftElbow);

  // elbows
  posRightWrist = part('rightWrist');
  (vrm.humanoid.getNormalizedBone('rightLowerArm') as VRMHumanBone).node.rotation.y = (posRightWrist && posRightElbow && posRightShoulder) ? angle(posRightWrist, posRightElbow) - angle(posRightElbow, posRightShoulder) : 0;
  posLeftWrist = part('leftWrist');
  (vrm.humanoid.getNormalizedBone('leftLowerArm') as VRMHumanBone).node.rotation.y = (posLeftWrist && posLeftElbow) ? angle(posLeftElbow, posLeftWrist) - angle(posLeftShoulder, posLeftElbow) : 0;

  // legs
  const posRightHip = part('rightHip');
  const posRightKnee = part('rightKnee');
  (vrm.humanoid.getNormalizedBone('rightUpperLeg') as VRMHumanBone).node.rotation.z = (posRightHip && posRightKnee) ? angle(posRightHip, posRightKnee) - (Math.PI / 2) : 0;
  const posLeftHip = part('leftHip');
  const posLeftKnee = part('leftKnee');
  (vrm.humanoid.getNormalizedBone('leftUpperLeg') as VRMHumanBone).node.rotation.z = (posLeftHip && posLeftKnee) ? angle(posLeftHip, posLeftKnee) - (Math.PI / 2) : 0;

  // knees
  /*
  const posRightAnkle = part('rightAnkle');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightLowerLeg).rotation.z = (posRightHip && posRightAnkle) ? angle(posRightHip, posRightAnkle) - (Math.PI / 2) : 0;
  const posLeftAnkle = part('leftAnkle');
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftLowerLeg).rotation.z = (posLeftHip && posLeftAnkle) ? angle(posLeftHip, posLeftAnkle) - (Math.PI / 2) : 0;
  */
}

async function updateHands(vrm: VRM, res) {
  const hands = (res && res.hand) ? res.hand : [];
  for (const hand of hands) {
    const distanceLeft = posLeftWrist ? Math.sqrt((hand.boxRaw[0] - posLeftWrist[0]) ** 2) + ((hand.boxRaw[1] - posLeftWrist[1]) ** 2) : Number.MAX_VALUE;
    const distanceRight = posRightWrist ? Math.sqrt((hand.boxRaw[0] - posRightWrist[0]) ** 2) + ((hand.boxRaw[1] - posRightWrist[1]) ** 2) : Number.MAX_VALUE;
    if (distanceLeft > 1 && distanceRight > 1) continue; // both hands are too far
    const left = distanceLeft < distanceRight;

    const handSize = Math.sqrt(((hand.box[2] || 1) ** 2) + (hand.box[3] || 1) ** 2) / Math.PI;
    const handRotation = (hand.annotations.pinky[0][2] - hand.annotations.thumb[0][2]) / handSize; // normalized z-coord of root of pinky and thumb fingers
    (vrm.humanoid.getNormalizedBone(left ? 'leftHand' : 'rightHand') as VRMHumanBone).node.rotation.z = -handRotation * Math.PI / 2; // rotate palm towards camera

    // finger curls
    const getCurl = (finger) => {
      let val = 0;
      if (hand.landmarks[finger].curl === 'half') val = Math.PI / 8;
      else if (hand.landmarks[finger].curl === 'full') val = Math.PI / 4;
      return val;
    };

    let val;
    val = getCurl('index');
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}IndexIntermediate`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}IndexProximal`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}IndexDistal`) as VRMHumanBone).node.rotation.z = val;
    val = getCurl('middle');
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}MiddleIntermediate`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}MiddleProximal`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}MiddleDistal`) as VRMHumanBone).node.rotation.z = val;
    val = getCurl('ring');
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}RingIntermediate`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}RingProximal`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}RingDistal`) as VRMHumanBone).node.rotation.z = val;
    val = getCurl('pinky');
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}LittleIntermediate`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}LittleProximal`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}LittleDistal`) as VRMHumanBone).node.rotation.z = val;
    val = getCurl('thumb');
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}ThumbMetacarpal`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}ThumbProximal`) as VRMHumanBone).node.rotation.z = val;
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}ThumbDistal`) as VRMHumanBone).node.rotation.z = val;

    // palm wave
    val = angle(hand.annotations.index[3], hand.annotations.palm[0]) - (Math.PI / 2);
    (vrm.humanoid.getNormalizedBone(`${left ? 'left' : 'right'}Hand`) as VRMHumanBone).node.rotation.y = val;
  }
}

async function updateFace(vrm: VRM, res: Result) {
  const face = (res && res.face) ? res.face[0] : null;
  if (!face) return;
  // face angles
  const faceAngle = face.rotation?.angle || { roll: 0, yaw: 0, pitch: 0 };
  (vrm.humanoid.getNormalizedBone('head') as VRMHumanBone).node.rotation.x = -faceAngle.pitch / 2;
  (vrm.humanoid.getNormalizedBone('head') as VRMHumanBone).node.rotation.y = -faceAngle.yaw / 2;
  (vrm.humanoid.getNormalizedBone('head') as VRMHumanBone).node.rotation.z = faceAngle.roll / 2 - leanBody;
  (vrm.humanoid.getNormalizedBone('neck') as VRMHumanBone).node.rotation.x = -faceAngle.pitch / 2;
  (vrm.humanoid.getNormalizedBone('neck') as VRMHumanBone).node.rotation.y = -faceAngle.yaw / 2;
  (vrm.humanoid.getNormalizedBone('neck') as VRMHumanBone).node.rotation.z = (faceAngle.roll / 2 - leanBody) / 2;
  // eye gaze direction
  const gaze = face.rotation?.gaze;
  if (gaze) {
    const target = new THREE.Object3D();
    if (gaze) target.position.x = 10 * gaze.strength * Math.sin(gaze.bearing);
    if (gaze) target.position.y = 10 * gaze.strength * Math.cos(gaze.bearing);
    if (vrm.lookAt) vrm.lookAt.target = target;
  }
  if (!vrm.expressionManager) return;
  // eye blinks
  if (face.mesh.length > 300) {
    const blinkL = 3 * (Math.abs(face.mesh[374][1] - face.mesh[386][1]) / Math.abs(face.mesh[443][1] - face.mesh[450][1]) - 0.15); // center of eye inner lid y coord div center of wider eye border y coord
    const blinkR = 3 * (Math.abs(face.mesh[145][1] - face.mesh[159][1]) / Math.abs(face.mesh[223][1] - face.mesh[230][1]) - 0.15); // center of eye inner lid y coord div center of wider eye border y coord
    vrm.expressionManager.setValue(VRMExpressionPresetName.BlinkLeft, 1 - blinkL);
    vrm.expressionManager.setValue(VRMExpressionPresetName.BlinkRight, 1 - blinkR);
  }
  // emotion reset
  vrm.expressionManager.setValue(VRMExpressionPresetName.Happy, 0);
  vrm.expressionManager.setValue(VRMExpressionPresetName.Angry, 0);
  vrm.expressionManager.setValue(VRMExpressionPresetName.Sad, 0);
  vrm.expressionManager.setValue(VRMExpressionPresetName.Surprised, 0);
  vrm.expressionManager.setValue(VRMExpressionPresetName.Relaxed, 0);
  vrm.expressionManager.setValue(VRMExpressionPresetName.Neutral, 0);
  // emotion set
  const emotion = face.emotion?.reduce((prev, curr) => (prev.score > curr.score ? prev : curr));
  switch (emotion?.emotion || '') {
    case 'happy': vrm.expressionManager.setValue(VRMExpressionPresetName.Happy, 1); break;
    case 'angry': vrm.expressionManager.setValue(VRMExpressionPresetName.Angry, 1); break;
    case 'sad': vrm.expressionManager.setValue(VRMExpressionPresetName.Sad, 1); break;
    case 'surprise': vrm.expressionManager.setValue(VRMExpressionPresetName.Surprised, 1); break;
    case 'neutral': vrm.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1); break;
    default: break;
  }
  // mouth open
  if (face.mesh.length > 300) {
    const mouth = Math.min(1, 5 * Math.abs(face.mesh[13][1] - face.mesh[14][1]) / Math.abs(face.mesh[10][1] - face.mesh[152][1]));
    vrm.expressionManager.setValue(VRMExpressionPresetName.Oh, mouth);
  }
}

export async function update(vrm, res) {
  if (!vrm || !vrm.humanoid) return;
  await updateBody(vrm, res);
  await updateFace(vrm, res);
  await updateHands(vrm, res);
}
