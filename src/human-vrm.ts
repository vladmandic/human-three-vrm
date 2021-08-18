import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRM, VRMSchema, VRMUtils } from '@pixiv/three-vrm'; // <https://github.com/pixiv/three-vrm>

import Stats from 'three/examples/jsm/libs/stats.module';
import { Human } from '@vladmandic/human';

const model = '../assets/victoria-jeans.vrm';

// globals
let vrm: VRM;
let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let scene: THREE.Scene;
let light: THREE.DirectionalLight;
let clock: THREE.Clock;
let stats: THREE.Stats;
let human: Human;
let res;

const humanConfig = {
  modelBasePath: '../node_modules/@vladmandic/human/models',
  warmup: 'full',
  backend: 'wasm',
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
  hand: { enabled: false },
  body: { enabled: true },
  segmentation: { enabled: false },
};

async function log(...msg) {
  // eslint-disable-next-line no-console
  console.log(...msg);
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
  controls = new OrbitControls(camera, renderer.domElement);
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
  await human.load();
  await human.warmup();
}

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

    const face = (interpolated && interpolated.face) ? interpolated.face[0] : null;
    if (face) {
      // face angles
      const angle = face.rotation?.angle || { roll: 0, yaw: 0, pitch: 0 };
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.x = -angle.pitch;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.y = angle.yaw;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.z = angle.roll;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.x = -angle.pitch / 2;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.y = angle.yaw / 2;
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Neck).rotation.z = angle.roll / 2;
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

    const body = (interpolated && interpolated.body) ? interpolated.body[0] : null;
    if (body) {
      const part = (what) => {
        const found = body.keypoints.find((a) => a.part === what);
        const pos = found ? found.positionRaw : null;
        return pos;
      };
      // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.x = 0.5; // lean back
      // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.y = 0.5; // turn left
      // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.z = 0.5; // lean left
      // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.x = -0.5; // rotate arm
      // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.y = -0.5; // move arm back
      // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.z = -0.5; // lower arm
      // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightLowerArm).rotation.z = -0.5; // lower arm in elbow

      // lean left/right
      const posLeftShoulder = part('leftShoulder');
      const posRightShoulder = part('rightShoulder');
      if (posLeftShoulder && posRightShoulder) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Chest).rotation.z = 3 * (posLeftShoulder[1] - posRightShoulder[1]);

      // move upper arms up/down
      const posRightElbow = part('rightElbow');
      if (posRightShoulder && posRightElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.z = 4 * (posRightShoulder[1] - posRightElbow[1]);
      const posLeftElbow = part('leftElbow');
      if (posLeftShoulder && posLeftElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftUpperArm).rotation.z = 4 * (posLeftElbow[1] - posLeftShoulder[1]);
      // bend elbows up/down
      const posRightWrist = part('rightWrist');
      if (posRightWrist && posRightElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightLowerArm).rotation.z = 6 * (posRightElbow[1] - posRightWrist[1]);
      const posLeftWrist = part('leftWrist');
      if (posLeftWrist && posLeftElbow) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftLowerArm).rotation.z = 6 * (posLeftWrist[1] - posLeftElbow[1]);
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
  res = await human.detect(video);
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
  log('vrm model:', model);
  vrm = await loadVRM(model);
  scene.add(vrm.scene);
  if (vrm && vrm.humanoid) vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Hips).rotation.y = Math.PI; // rotate to face camera
  log('vrm scene:', vrm);
  renderer.render(scene, camera);
  await initHuman();
  await initWebCam();
  log('vrm schema', VRMSchema);
  animate();
  detect();
}

window.onload = main;
