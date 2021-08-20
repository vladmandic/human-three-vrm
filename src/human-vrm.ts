import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRM, VRMSchema, VRMUtils } from '@pixiv/three-vrm'; // npm package <https://github.com/pixiv/three-vrm>
import { Human, Result } from '@vladmandic/human';
// import { VRM, VRMSchema, VRMUtils } from '../assets/three-vrm.module'; // custom build from 1.0 beta branch <https://github.com/pixiv/three-vrm/tree/1.0>

const model = '../assets/victoria-jeans.vrm';
// const model = '../assets/downloads/base.vrm';
// const model = '../assets/downloads/mikumiku.vrm';
// const model = '../assets/downloads/chim.vrm';
// const model = '../assets/downloads/yukionna.vrm';

// globals
let vrm: VRM;
let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let light: THREE.DirectionalLight;
let clock: THREE.Clock;
let stats: THREE.Stats;
let human: Human;
let res: Result;

const humanConfig = {
  // modelBasePath: '../node_modules/@vladmandic/human/models',
  modelBasePath: 'https://vladmandic.github.io/human/models',
  warmup: 'full',
  backend: 'humangl',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@3.8.0/dist/',
  face: { enabled: true,
    detector: { return: false, rotation: true },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: { enabled: false },
    emotion: { enabled: true },
  },
  object: { enabled: false },
  gesture: { enabled: false },
  hand: { enabled: true },
  body: { enabled: true },
  segmentation: { enabled: false },
};

async function log(...msg) {
  // eslint-disable-next-line no-console
  console.log(...msg);
  const div = document.getElementById('log') as HTMLElement;
  div.innerText = msg.join(' ');
}

async function initThree() {
  // renderer
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas });
  renderer.setClearColor(0x000000);
  // renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  // document.body.appendChild(renderer.domElement);
  // camera
  camera = new THREE.PerspectiveCamera(22.0, canvas.width / canvas.height, 0.1, 20.0);
  camera.position.set(0.0, 1.0, 5.0);
  // camera controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  controls.target.set(0.0, 0.9, 0.0);
  controls.enabled = true;
  controls.update();
  // three screne
  scene = new THREE.Scene();
  // light
  light = new THREE.DirectionalLight(0xffffff);
  light.position.set(1.0, 1.0, 1.0).normalize();
  scene.add(light);
  // grid
  const gridHelper = new THREE.GridHelper(100, 100);
  scene.add(gridHelper);
  // axes
  // const axesHelper = new THREE.AxesHelper(5);
  // scene.add(axesHelper);
  // clock
  clock = new THREE.Clock();
  // stats
  stats = Stats();
  document.body.appendChild(stats.dom);
  // initial render
  renderer.render(scene, camera);
}

async function loadVRM(f): Promise<VRM> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      f,
      (gltf) => {
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        VRM.from(gltf).then((vrmInstance) => resolve(vrmInstance));
      },
      () => {
        // log('loading vrm model:', progress);
      },
      (error) => {
        log('error:', error);
        reject(error);
      },
    );
  });
}

async function initHuman() {
  human = new Human(humanConfig);
  log(`human ${human.version}`);
  await human.load();
  await human.warmup();
}

const angle = (pt1, pt2) => {
  if (!pt1 || !pt2 || pt1.length < 2 || pt2.length < 2) return 0;
  const radians = Math.atan2(pt2[1] - pt1[1], pt2[0] - pt1[0]);
  return radians;
};

async function animate() {
  const deltaTime = clock.getDelta();
  if (vrm && vrm.humanoid && vrm.blendShapeProxy && vrm.lookAt) {
    // get human interpolated results
    const interpolated = human.next(res);
    // draw human detected results
    const detected = document.getElementById('detected') as HTMLCanvasElement;
    const ctx = detected.getContext('2d');
    const video = document.getElementById('video') as HTMLVideoElement;
    ctx?.drawImage(video, 0, 0, 640, 480);
    human.draw.all(detected, interpolated);

    light.position.set(Math.sin(Math.PI * clock.elapsedTime), Math.cos(Math.PI * clock.elapsedTime), Math.sin(Math.PI * clock.elapsedTime) + Math.cos(Math.PI * clock.elapsedTime)).normalize();

    const body = (interpolated && interpolated.body) ? interpolated.body[0] : null;
    let leanBody = 0;
    let posLeftWrist;
    let posRightWrist;
    if (body) {
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
      if (posRightShoulder && posRightElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.z = angle(posRightElbow, posRightShoulder);
      const posLeftElbow = part('leftElbow');
      if (posLeftShoulder && posLeftElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftUpperArm).rotation.z = angle(posLeftShoulder, posLeftElbow);

      // elbows
      posRightWrist = part('rightWrist');
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightLowerArm).rotation.z = (posRightWrist && posRightElbow && posRightShoulder) ? angle(posRightWrist, posRightElbow) - angle(posRightElbow, posRightShoulder) : 0;
      posLeftWrist = part('leftWrist');
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftLowerArm).rotation.z = (posLeftWrist && posLeftElbow) ? angle(posLeftElbow, posLeftWrist) - angle(posLeftShoulder, posLeftElbow) : 0;

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

    const face = (interpolated && interpolated.face) ? interpolated.face[0] : null;
    if (face) {
      // face angles
      const faceAngle = face.rotation?.angle || { roll: 0, yaw: 0, pitch: 0 };
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.x = -faceAngle.pitch / 2;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.y = -faceAngle.yaw / 2;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.z = faceAngle.roll / 2 - leanBody;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.x = -faceAngle.pitch / 2;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.y = -faceAngle.yaw / 2;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.z = (faceAngle.roll / 2 - leanBody) / 2;
      // eye blinks
      const blinkL = 3 * (Math.abs(face.mesh[374][1] - face.mesh[386][1]) / Math.abs(face.mesh[443][1] - face.mesh[450][1]) - 0.15); // center of eye inner lid y coord div center of wider eye border y coord
      const blinkR = 3 * (Math.abs(face.mesh[145][1] - face.mesh[159][1]) / Math.abs(face.mesh[223][1] - face.mesh[230][1]) - 0.15); // center of eye inner lid y coord div center of wider eye border y coord
      vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.BlinkL, 1 - blinkL);
      vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.BlinkR, 1 - blinkR);
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
      const mouth = Math.min(1, 5 * Math.abs(face.mesh[13][1] - face.mesh[14][1]) / Math.abs(face.mesh[10][1] - face.mesh[152][1]));
      vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.O, mouth);
      // eye gaze direction
      const gaze = face.rotation?.gaze;
      const target = new THREE.Object3D();
      if (gaze) target.position.x = 10 * gaze.strength * Math.sin(gaze.bearing);
      if (gaze) target.position.y = 10 * gaze.strength * Math.cos(gaze.bearing);
      vrm.lookAt.target = target;
    }

    // todo: redo hand to use coordinates instead of angles
    // todo: detect left vs right hand
    const hands = (interpolated && interpolated.hand) ? interpolated.hand : [];
    for (const hand of hands) {
      const distanceLeft = posLeftWrist ? Math.sqrt((hand.boxRaw[0] - posLeftWrist[0]) ** 2) + ((hand.boxRaw[1] - posLeftWrist[1]) ** 2) : Number.MAX_VALUE;
      const distanceRight = posRightWrist ? Math.sqrt((hand.boxRaw[0] - posRightWrist[0]) ** 2) + ((hand.boxRaw[1] - posRightWrist[1]) ** 2) : Number.MAX_VALUE;
      if (distanceLeft > 1 && distanceRight > 1) continue; // both hands are too far
      const left = distanceLeft < distanceRight;

      const handSize = Math.sqrt(((hand.box[2] || 1) ** 2) + (hand.box[3] || 1) ** 2) / Math.PI;
      const handRotation = (hand.annotations.pinky[0][2] - hand.annotations.thumb[0][2]) / handSize; // normalized z-coord of root of pinky and thumb fingers
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftHand' : 'RightHand']).rotation.z = -handRotation * Math.PI / 2;

      // log('hand', hand); // print detected hand

      // const base = [hand.annotations.palmBase[0][0] / video.videoWidth, hand.annotations.palmBase[0][1] / video.videoWidth, hand.annotations.palmBase[0][2] / video.videoWidth]; // use as reference point

      /*
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftIndexIntermediate' : '']).rotation.z = -hand.annotations.indexFinger[1][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftIndexProximal' : '']).rotation.z = -hand.annotations.indexFinger[2][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftIndexDistal' : '']).rotation.z = -hand.annotations.indexFinger[3][2] / handSize;

      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftMiddleIntermediate' : '']).rotation.z = -hand.annotations.middleFinger[1][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftMiddleProximal' : '']).rotation.z = -hand.annotations.middleFinger[2][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftMiddleDistal' : '']).rotation.z = -hand.annotations.middleFinger[3][2] / handSize;

      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftRingIntermediate' : '']).rotation.z = -hand.annotations.ringFinger[1][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftRingProximal' : '']).rotation.z = -hand.annotations.ringFinger[2][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftRingDistal' : '']).rotation.z = -hand.annotations.ringFinger[3][2] / handSize;

      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftLittleIntermediate' : '']).rotation.z = -hand.annotations.pinky[1][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftLittleProximal' : '']).rotation.z = -hand.annotations.pinky[2][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftLittleDistal' : '']).rotation.z = -hand.annotations.pinky[3][2] / handSize;

      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftThumbIntermediate' : '']).rotation.x = hand.annotations.thumb[1][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftThumbProximal' : '']).rotation.x = hand.annotations.thumb[2][2] / handSize;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[left ? 'LeftThumbDistal' : '']).rotation.x = hand.annotations.thumb[3][2] / handSize;
      */
    }

    // log('vrm pose:', vrm.humanoid.getPose()); // print all pose details
    // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Hips).rotation.y = Math.PI - Math.sin(Math.PI * clock.elapsedTime); // rotate circular

    vrm.update(deltaTime);
  }
  renderer.render(scene, camera);
  stats.update();
  requestAnimationFrame(animate);
}

async function detect() {
  const video = document.getElementById('video') as HTMLVideoElement;
  res = await human.detect(video) as Result;
  // log(`detect: ${res?.canvas?.width || 0} x ${res?.canvas?.height || 0} in ${res?.performance?.total || 0} ms`);
  if (!video.paused) requestAnimationFrame(detect);
}

async function initWebCam() {
  if (!navigator.mediaDevices) return null;
  const video = document.getElementById('video') as HTMLVideoElement;
  const constraints = {
    audio: false,
    video: { facingMode: 'user', resizeMode: 'none', width: { ideal: 640 } },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  if (stream) video.srcObject = stream;
  else return null;
  // return when camera is ready
  window.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      detect();
    } else {
      video.pause();
    }
  });
  return new Promise((resolve) => {
    video.onloadeddata = async () => {
      // video.width = video.videoWidth;
      // video.height = video.videoHeight;
      video.play();
      resolve(video);
    };
  });
}

async function main() {
  await initThree();
  vrm = await loadVRM(model);
  log('vrm model:', model);
  if (!vrm) return;
  scene.add(vrm.scene);
  if (!vrm.humanoid) return;
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Hips).rotation.y = Math.PI; // rotate to face camera
  renderer.render(scene, camera);
  await initHuman();
  await initWebCam();
  log('vrm schema', VRMSchema);
  log('vrm scene:', vrm);
  log('vrm pose:', vrm.humanoid.getPose()); // print all pose details

  // debug: export globals so they can be used from inspector
  window['vrm'] = vrm;
  window['VRMSchema'] = VRMSchema;
  window['light'] = light;

  animate();
  detect();
  log('');
}

window.onload = main;

/* VRMSchema Notes
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.x = - Math.PI / 3 ... Math.PI / 3; // lean forward to back
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.y = - Math.PI / 2 ... Math.PI / 2; // turn left to right
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.z = - Math.PI / 3 ... Math.PI / 3; // tilt left to right

  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.x = - Math.PI ... Math.PI; // lean forward to back
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.y = - Math.PI / 2... Math.PI / 2; // twist left to right
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.y = - Math.PI / 2... Math.PI / 2; // lean left to right

  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.x = - Math.PI / 2... Math.PI / 2; // rotate arm
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.y = - 2 * Math.PI / 3... 2 * Math.PI / 3; // move arm back to forward
  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.z = - Math.PI / 2... Math.PI / 2; // lower arm

  vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightLowerArm).rotation.z = -0.5; // lower arm in elbow

  const s = 0.25 * Math.PI * Math.sin(Math.PI * clock.elapsedTime);
  console.log(s);
  light.position.set(Math.sin(Math.PI * clock.elapsedTime), Math.cos(Math.PI * clock.elapsedTime), Math.sin(Math.PI * clock.elapsedTime) + Math.cos(Math.PI * clock.elapsedTime)).normalize();

*/
