import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMHumanBone, VRMUtils, VRMLoaderPlugin } from '@pixiv/three-vrm'; // npm package <https://github.com/pixiv/three-vrm>
import { Human, Result, Config } from '@vladmandic/human';
import * as vrmCalc from './vrm-calculate';

const model = '../assets/CC_Model_Clonex.vrm';
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
let human: Human;
let res: Result;

const humanConfig: Partial<Config> = {
  modelBasePath: 'https://vladmandic.github.io/human-models/models',
  face: { enabled: true,
    detector: { return: false, rotation: true },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: { enabled: false },
    emotion: { enabled: true },
  },
  body: { enabled: true },
  hand: { enabled: true },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

async function log(...msg) {
  console.log(...msg); // eslint-disable-line no-console
  const div = document.getElementById('log') as HTMLElement;
  div.innerText = msg.join(' ');
}

async function setupScene() {
  // renderer
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas });
  renderer.setClearColor(0x000000);
  // renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  // camera
  camera = new THREE.PerspectiveCamera(22.0, canvas.width / canvas.height, 0.1, 20.0);
  camera.position.set(0.0, 0.9, 15.0);
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
  // background
  const loader = new THREE.TextureLoader();
  loader.load('../assets/2.png', (texture) => scene.background = texture);
  // clock
  clock = new THREE.Clock();
  // initial render
  renderer.render(scene, camera);
}

async function loadVRM(f): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return new Promise((resolve, reject) => {
    loader.load(
      f,
      (gltf) => {
        const vrmInstance = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        vrmInstance.scene.traverse((obj) => { obj.frustumCulled = false; });
        log('vrm instance', vrmInstance);
        resolve(vrmInstance);
      },
      (progress) => {
        log('vrm load', progress.loaded);
      },
      (error) => {
        log('vrm load error', error);
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

async function animateFrame() {
  const deltaTime = clock.getDelta();
  // get human interpolated results
  const interpolated: Result = human.next(res);
  // draw human detected results
  const detected = document.getElementById('detected') as HTMLCanvasElement;
  const ctx = detected.getContext('2d');
  const video = document.getElementById('video') as HTMLVideoElement;
  ctx?.drawImage(video, 0, 0, 640, 480);
  human.draw.all(detected, interpolated);
  light.position.set(Math.sin(Math.PI * clock.elapsedTime), Math.cos(Math.PI * clock.elapsedTime), Math.sin(Math.PI * clock.elapsedTime) + Math.cos(Math.PI * clock.elapsedTime)).normalize();

  await vrmCalc.update(vrm, interpolated);
  // log('vrm pose:', vrm.humanoid.getPose()); // print all pose details
  // vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Hips).rotation.y = Math.PI - Math.sin(Math.PI * clock.elapsedTime); // rotate circular

  vrm.update(deltaTime);
  renderer.render(scene, camera);
  requestAnimationFrame(animateFrame);
}

async function detectionLoop() {
  const video = document.getElementById('video') as HTMLVideoElement;
  res = await human.detect(video);
  if (!video.paused) requestAnimationFrame(detectionLoop);
}

async function initWebCam() {
  if (!navigator.mediaDevices) return;
  const video = document.getElementById('video') as HTMLVideoElement;
  const constraints = { audio: false, video: { facingMode: 'user', resizeMode: 'none', width: { ideal: 640 } } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  // play&pause on click
  window.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      detectionLoop();
    } else {
      video.pause();
    }
  });
  // return when camera is ready
  const videoReady = new Promise((resolve) => { video.onloadeddata = () => resolve(true); });
  video.srcObject = stream;
  await videoReady;
  video.play();
}

async function startupAnimation() { // rotate to face camera
  const wait = async (t) => new Promise((resolve) => { setTimeout(() => resolve(true), t); });
  if (!vrm.humanoid) return;
  while (clock.elapsedTime < Math.PI) {
    const deltaTime = clock.getDelta();
    (vrm.humanoid.getNormalizedBone('hips') as VRMHumanBone).node.rotation.y = clock.elapsedTime; // rotate body to face camera
    (vrm.humanoid.getNormalizedBone('leftUpperArm') as VRMHumanBone).node.rotation.x = clock.elapsedTime / 2; // turn palms towards camera
    (vrm.humanoid.getNormalizedBone('rightUpperArm') as VRMHumanBone).node.rotation.x = clock.elapsedTime / 2; // turn palms towards camera
    (vrm.humanoid.getNormalizedBone('leftUpperArm') as VRMHumanBone).node.rotation.y = clock.elapsedTime / 3; // lower arms
    (vrm.humanoid.getNormalizedBone('rightUpperArm') as VRMHumanBone).node.rotation.y = clock.elapsedTime / 3; // lower arms
    (vrm.humanoid.getNormalizedBone('hips') as VRMHumanBone).node.rotation.y = clock.elapsedTime;
    light.position.set(Math.cos(Math.PI * clock.elapsedTime), Math.sin(Math.PI * clock.elapsedTime), Math.sin(Math.PI * clock.elapsedTime) + Math.cos(Math.PI * clock.elapsedTime)).normalize(); // rotate light
    camera.position.set(0.0, 0.9, 10 * (1 - (clock.elapsedTime / Math.PI)) + 5.0); // zoom in
    vrm.update(deltaTime);
    renderer.render(scene, camera);
    await wait(10);
  }
}

async function main() {
  await setupScene();
  vrm = await loadVRM(model); // load vrm model
  log('vrm model:', model);
  scene.add(vrm.scene); // add model to scene
  if (!vrm.humanoid) return;
  renderer.render(scene, camera); // initial display render

  await initHuman(); // initialize human library
  await initWebCam(); // initialize webcam
  log('vrm scene:', vrm);
  log('vrm pose:', vrm.humanoid.getRawPose()); // print all pose details

  // debug: export globals so they can be accessed from browser inspector
  window['light'] = light;
  window['camera'] = camera;
  window['human'] = human;
  window['vrm'] = vrm;

  await startupAnimation();
  animateFrame(); // starts animation draw loop
  detectionLoop(); // starts detection loop
  log('');
}

window.onload = main;
