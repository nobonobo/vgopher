import * as posenet from "./posenet.js";
import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/r122/three.module.js";

window.THREE = THREE;
const videoWidth = 200;
const videoHeight = 200;

const AverageN = 4;

function makeGopher() {
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x44ffff });
  const noseMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const lipMat = new THREE.MeshBasicMaterial({ color: 0xffdddd });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(25, 16, 16), whiteMat);
  const eye2 = eye1.clone();
  const pupil1 = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), blackMat);
  const pupil2 = pupil1.clone();

  const earGeom = new THREE.Geometry();
  const ear1 = new THREE.Mesh(
    new THREE.SphereGeometry(20, 8, 8).scale(1, 1, 0.3)
  );
  ear1.position.set(75, 75, 0);
  ear1.updateMatrix();
  earGeom.merge(ear1.geometry, ear1.matrix);
  const ear2 = ear1.clone();
  ear2.position.set(-75, 75, 0);
  ear2.updateMatrix();
  earGeom.merge(ear2.geometry, ear2.matrix);
  const ears = new THREE.Mesh(earGeom, baseMat);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), noseMat);
  const lip1 = new THREE.Mesh(new THREE.SphereGeometry(15, 8, 8), lipMat);
  const lip2 = lip1.clone();
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), whiteMat);
  eye1.position.set(30, 30, 90);
  pupil1.position.set(35, 35, 110);
  eye2.position.set(-30, 30, 90);
  pupil2.position.set(-35, 35, 110);
  nose.position.set(0, 0, 110);
  lip1.position.set(10, -10, 105);
  lip2.position.set(-10, -10, 105);
  tooth.position.set(0, -20, 105);
  const face = new THREE.Group();
  face.add(eye1);
  face.add(pupil1);
  face.add(eye2);
  face.add(pupil2);
  face.add(ears);
  face.add(nose);
  face.add(lip1);
  face.add(lip2);
  face.add(tooth);

  const baseGeom = new THREE.Geometry();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(100, 100, 150, 32));
  body.updateMatrix();
  baseGeom.merge(body.geometry, body.matrix);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(
      100,
      16,
      16,
      0,
      2 * Math.PI,
      1.5 * Math.PI,
      Math.PI
    )
  );
  head.position.set(0, 75, 0);
  head.updateMatrix();
  baseGeom.merge(head.geometry, head.matrix);
  const hip = new THREE.Mesh(
    new THREE.SphereGeometry(
      100,
      16,
      16,
      0,
      2 * Math.PI,
      0.5 * Math.PI,
      Math.PI
    )
  );
  hip.position.set(0, -75, 0);
  hip.updateMatrix();
  baseGeom.merge(hip.geometry, hip.matrix);

  const base = new THREE.Mesh(baseGeom, baseMat);
  face.position.set(0, 75, 0);
  const total = new THREE.Group();
  face.name = "face";
  base.name = "base";
  total.add(face);
  total.add(base);
  return total;
}

let camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  1,
  1000
);
camera.position.z = 400;

let scene = new THREE.Scene();
let renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x00ff00, 1.0);
document.body.appendChild(renderer.domElement);

const gopher = makeGopher();
scene.add(gopher);

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isiOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isMobile() {
  return isAndroid() || isiOS();
}

async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      "Browser API navigator.mediaDevices.getUserMedia not available"
    );
  }

  const video = document.getElementById("video");
  video.width = videoWidth;
  video.height = videoHeight;

  const mobile = isMobile();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: mobile ? undefined : videoWidth,
      height: mobile ? undefined : videoHeight,
    },
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();
  return new Promise((resolve) => {
    video.onloadeddata = () => {
      resolve(video);
    };
  });
}

class Transform {
  constructor() {
    this.average = {};
  }
  updateKeypoints(_keypoints, treshHoldScore) {
    this.keypoints = {};
    _keypoints.forEach(({ score, part, position }) => {
      if (score > treshHoldScore) {
        if (this.average[part] == undefined) {
          this.average[part] = [];
        }
        this.average[part].push(position);
        if (this.average[part].length > AverageN) {
          this.average[part].shift();
        }
        var sum = { x: 0, y: 0 };
        var count = this.average[part].length;
        this.average[part].forEach((item) => {
          sum.x = sum.x + item.x;
          sum.y = sum.y + item.y;
        });
        this.keypoints[part] = { x: sum.x / count, y: sum.y / count };
      }
    });
    this.angle = Math.PI / 2;
    this.yaw = Math.PI / 2;
    this.pitch = Math.PI / 2;
    this.distance = null;
    this.headCenter = null;
    this.shoulderCenter = null;
    this.calibrate();
  }
  calibrate() {
    if (this.keypoints["leftEye"] && this.keypoints["rightEye"]) {
      const left_x = this.keypoints["leftEye"].x;
      const left_y = this.keypoints["leftEye"].y;
      const right_x = this.keypoints["rightEye"].x;
      const right_y = this.keypoints["rightEye"].y;
      this.angle = this.findAngle(
        { x: left_x, y: left_y + 1 },
        { x: left_x, y: left_y },
        { x: right_x, y: right_y }
      );
      this.distance = Math.sqrt(
        Math.pow(left_x - right_x, 2) + Math.pow(left_y - right_y, 2)
      );
      if (this.keypoints["nose"]) {
        this.head(
          this.keypoints["leftEye"],
          this.keypoints["rightEye"],
          this.keypoints["nose"]
        );
      }
      this.headCenter = {
        x: (left_x + right_x) / 2.0 - (right_x - left_x) * Math.cos(this.yaw),
        y: (left_y + right_y) / 2.0,
      };
    }
    if (this.keypoints["leftShoulder"] && this.keypoints["rightShoulder"]) {
      const left_x = this.keypoints["leftShoulder"].x;
      const left_y = this.keypoints["leftShoulder"].y;
      const right_x = this.keypoints["rightShoulder"].x;
      const right_y = this.keypoints["rightShoulder"].y;

      this.shoulderCenter = {
        x: (left_x + right_x) / 2.0,
        y: (left_y + right_y) / 2.0,
      };
    }
  }
  map(original, in_min, in_max, out_min, out_max) {
    return (
      ((original - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min
    );
  }
  normalize(p) {
    const l = Math.sqrt(Math.pow(p.x, 2) + Math.pow(p.y, 2));
    return { x: p.x / l, y: p.y / l };
  }
  dot(m, v) {
    return {
      x: m[0].x * v.x + m[0].y * v.y,
      y: m[1].x * v.x + m[1].y * v.y,
    };
  }
  head(p1, p2, p3) {
    const h = this.normalize({ x: p1.x - p2.x, y: p1.y - p2.y });
    const v = this.normalize({ x: h.y, y: -h.x });
    const m = [h, v];
    let leye = this.dot(m, { x: p1.x - p3.x, y: p1.y - p3.y });
    let reye = this.dot(m, { x: p2.x - p3.x, y: p2.y - p3.y });
    let nose = p3;
    this.yaw =
      Math.PI / 2 - ((Math.PI / 6) * (leye.x + reye.x)) / (leye.x - reye.x);
    this.pitch =
      Math.PI / 1.8 + ((Math.PI / 12) * (leye.y + reye.y)) / (leye.x - reye.x);
  }
  findAngle(p1, p2, p3) {
    const p12 = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    const p13 = Math.sqrt(Math.pow(p1.x - p3.x, 2) + Math.pow(p1.y - p3.y, 2));
    const p23 = Math.sqrt(Math.pow(p2.x - p3.x, 2) + Math.pow(p2.y - p3.y, 2));
    const resultRadian = Math.acos(
      (Math.pow(p12, 2) + Math.pow(p13, 2) - Math.pow(p23, 2)) / (2 * p12 * p13)
    );
    return resultRadian;
  }
}

async function detectPoseInRealTime(video, net) {
  const flipHorizontal = true;
  const transform = new Transform();

  const minPoseConfidence = 0.1;
  const minPartConfidence = 0.5;

  async function poseDetectionFrame() {
    let poses = [];
    const pose = await net.estimateSinglePose(video, {
      flipHorizontal: flipHorizontal,
      decodingMethod: "single-person",
    });
    poses.push(pose);
    renderer.render(scene, camera);
    var lastBaseAngle = 0;

    poses.forEach(({ score, keypoints }) => {
      if (score >= minPoseConfidence) {
        transform.updateKeypoints(keypoints, minPartConfidence);
        const headCenter = transform.headCenter;
        const shoulderCenter = transform.shoulderCenter;
        let face = gopher.getObjectByName("face");
        let angle = Math.PI / 2 - transform.angle;
        let yaw = Math.PI / 2 - transform.yaw;
        let pitch = Math.PI / 2 - transform.pitch;
        face.setRotationFromEuler(new THREE.Euler(pitch, yaw, angle, "ZYX"));
        if (headCenter != null) {
          if (shoulderCenter != null) {
            let angle = transform.findAngle(
              { x: headCenter.x + 1, y: headCenter.y },
              headCenter,
              shoulderCenter
            );
            lastBaseAngle = angle - Math.PI / 2;
            gopher.setRotationFromAxisAngle(
              new THREE.Vector3(0, 0, 1),
              lastBaseAngle
            );
          }
          gopher.position.set(
            headCenter.x - 100,
            -25 - headCenter.y,
            transform.distance
          );
        }
      }
    });
    requestAnimationFrame(poseDetectionFrame);
  }
  poseDetectionFrame();
}

let state = { net: null };

async function startGopher() {
  let btn = document.getElementById("btn");
  if (btn != undefined) {
    btn.parentNode.removeChild(btn);
  }
  if (state.net != null) {
    state.net.dispose();
  }
  const video = await loadVideo();
  const net = await posenet.load({
    algorithm: "single-pose",
    architecture: "MobileNetV1",
    outputStride: 16,
    inputResolution: videoWidth,
    multiplier: 0.5,
    quantBytes: 2,
  });
  state.net = net;
  await detectPoseInRealTime(video, net);
}

async function stopGopher() {
  if (state.net != null) {
    state.net.dispose();
  }
  const video = document.getElementById("video");
  video.srcObject.getTracks().forEach((t) => t.stop());
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", async (ev) => {
  if (ev.code == "KeyG") {
    if (state.net == null) {
      await startGopher();
    } else {
      await stopGopher();
      state.net = null;
    }
  }
});

window.startGopher = startGopher;
