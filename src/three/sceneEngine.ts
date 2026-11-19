import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  buildSceneDiorama,
  type LightingMoodId,
  type SceneDiorama,
  type ScenePresetId,
} from './proceduralModels';
import { createProceduralTextures, type ProceduralTexturePack } from './textures';

export type CameraAngleId = 'establishing' | 'character_hook' | 'low_dramatic' | 'overhead';

export interface CameraPresetTarget {
  position: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: Record<CameraAngleId, CameraPresetTarget> = {
  establishing: { position: [7.8, 5.2, 9.6], target: [0, 1.8, 0] },
  character_hook: { position: [2.6, 2.4, 4.4], target: [0, 1.7, -0.3] },
  low_dramatic: { position: [-4.8, 1.65, 5.6], target: [0, 2.7, -0.6] },
  overhead: { position: [0.2, 12.2, 6.2], target: [0, 0.8, 0] },
};

const LIGHTING_CONFIGS: Record<
  LightingMoodId,
  {
    bgHex: number;
    fogDensity: number;
    keyHex: number;
    keyIntensity: number;
    keyPos: [number, number, number];
    hemiSkyHex: number;
    hemiGroundHex: number;
    hemiIntensity: number;
    accentHex: number;
    accentIntensity: number;
  }
> = {
  twilight: {
    bgHex: 0x162238,
    fogDensity: 0.022,
    keyHex: 0xffb36b,
    keyIntensity: 2.35,
    keyPos: [10, 14, 8],
    hemiSkyHex: 0x7aa2d9,
    hemiGroundHex: 0x2b1d14,
    hemiIntensity: 0.72,
    accentHex: 0xff922b,
    accentIntensity: 3.4,
  },
  midnight: {
    bgHex: 0x090f1c,
    fogDensity: 0.028,
    keyHex: 0x9ec5ff,
    keyIntensity: 1.65,
    keyPos: [-8, 15, 7],
    hemiSkyHex: 0x4b6a99,
    hemiGroundHex: 0x12151f,
    hemiIntensity: 0.55,
    accentHex: 0xff7b29,
    accentIntensity: 4.5,
  },
  golden_dawn: {
    bgHex: 0x3b261d,
    fogDensity: 0.018,
    keyHex: 0xffd280,
    keyIntensity: 2.8,
    keyPos: [14, 9, 6],
    hemiSkyHex: 0xf7b277,
    hemiGroundHex: 0x382419,
    hemiIntensity: 0.78,
    accentHex: 0xfbbf24,
    accentIntensity: 2.6,
  },
};

// Module-scope scratch vectors for zero-GC render loop
const _goalPos = new THREE.Vector3();
const _goalLook = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class ThreeSceneEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private textures: ProceduralTexturePack;
  private diorama: SceneDiorama | null = null;
  private isSoftwareGl: boolean;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private accentLight: THREE.PointLight;
  private envRT: THREE.WebGLRenderTarget;

  private frameId = 0;
  private ambientTimerId = 0;
  private isDisposed = false;
  private lastTimeMs = performance.now();
  private elapsedSec = 0;
  private activeTransition: CameraPresetTarget | null = null;
  private resizeObserver: ResizeObserver;
  private renderBusy = false;
  private renderPending = false;

  constructor(container: HTMLElement, initialPreset: ScenePresetId, initialMood: LightingMoodId) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(240, container.clientHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Procedural RoomEnvironment reflections on EVERY device (required for metallic brass/water)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 140);
    const startCam = CAMERA_PRESETS.establishing;
    this.camera.position.set(...startCam.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 3.0;
    this.controls.maxDistance = 24;
    this.controls.target.set(...startCam.target);
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.activeTransition = null;
    });
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });

    // Balanced warm/cool 3-light rig (1 directional shadow caster + cool hemisphere + warm accent point light)
    this.hemiLight = new THREE.HemisphereLight(0x7aa2d9, 0x2b1d14, 0.72);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffb36b, 2.35);
    this.keyLight.position.set(10, 14, 8);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 42;
    const d = 11;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.accentLight = new THREE.PointLight(0xff922b, 3.4, 18, 1.8);
    this.accentLight.position.set(0, 2.6, 0.8);
    this.scene.add(this.accentLight);

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.setLightingMood(initialMood);
    this.setScenePreset(initialPreset);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.startLoop();
  }

  public setScenePreset(preset: ScenePresetId): void {
    if (this.diorama) {
      this.scene.remove(this.diorama.root);
      this.diorama.dispose();
      this.diorama = null;
    }
    this.diorama = buildSceneDiorama(preset, this.textures, this.isSoftwareGl);
    this.scene.add(this.diorama.root);
    this.requestRender();
  }

  public setLightingMood(mood: LightingMoodId): void {
    const cfg = LIGHTING_CONFIGS[mood];
    const bgColor = new THREE.Color(cfg.bgHex);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(cfg.bgHex, cfg.fogDensity);
    this.keyLight.color.setHex(cfg.keyHex);
    this.keyLight.intensity = cfg.keyIntensity;
    this.keyLight.position.set(...cfg.keyPos);
    this.hemiLight.color.setHex(cfg.hemiSkyHex);
    this.hemiLight.groundColor.setHex(cfg.hemiGroundHex);
    this.hemiLight.intensity = cfg.hemiIntensity;
    this.accentLight.color.setHex(cfg.accentHex);
    this.accentLight.intensity = cfg.accentIntensity;
    this.requestRender();
  }

  public flyToCameraAngle(angle: CameraAngleId): void {
    this.activeTransition = CAMERA_PRESETS[angle];
    this.requestRender();
  }

  public captureSnapshotDataUrl(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  private handleResize(): void {
    if (this.isDisposed) return;
    const width = Math.max(320, this.container.clientWidth);
    const height = Math.max(240, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender();
  }

  private afterDraw(cb: () => void, delayMs = 80): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, delayMs);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    let polls = 0;
    const poll = () => {
      if (this.isDisposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      polls += 1;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED && polls < 40) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, delayMs);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private renderFrame(): void {
    if (this.isDisposed) return;
    const nowMs = performance.now();
    const dt = Math.max(0.001, Math.min(0.35, (nowMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = nowMs;
    this.elapsedSec += dt;
    const elapsed = this.elapsedSec;

    if (this.diorama) {
      const { waterShaderUniforms, flames, floatingLotusOrDiyas, pendulumGroup, bannerGroup } =
        this.diorama.animatedParts;
      if (waterShaderUniforms) {
        waterShaderUniforms.uTime.value = elapsed;
      }
      flames.forEach((fl, i) => {
        const pulse = 0.92 + Math.sin(elapsed * 7.5 + i * 1.3) * 0.12;
        fl.scale.set(1, pulse, 1);
      });
      floatingLotusOrDiyas.forEach((dy, i) => {
        dy.position.y = 0.08 + Math.sin(elapsed * 1.6 + i * 1.1) * 0.035;
      });
      if (pendulumGroup) {
        pendulumGroup.rotation.z = Math.sin(elapsed * 1.2) * 0.055;
      }
      if (bannerGroup) {
        bannerGroup.rotation.y = Math.sin(elapsed * 2.4) * 0.14;
      }
    }

    if (this.activeTransition) {
      const alpha = 1 - Math.exp(-6.5 * dt);
      _goalPos.set(...this.activeTransition.position);
      _goalLook.set(...this.activeTransition.target);
      this.camera.position.lerp(_goalPos, alpha);
      this.controls.target.lerp(_goalLook, alpha);
      if (
        this.camera.position.distanceTo(_goalPos) < 0.05 &&
        this.controls.target.distanceTo(_goalLook) < 0.05
      ) {
        this.camera.position.copy(_goalPos);
        this.controls.target.copy(_goalLook);
        this.activeTransition = null;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private requestRender(): void {
    if (this.isDisposed) return;
    if (this.renderBusy) {
      this.renderPending = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      this.renderPending = false;
      this.renderFrame();
      const done = () => {
        this.renderBusy = false;
        if (this.renderPending || this.activeTransition) {
          this.requestRender();
        }
      };
      if (this.isSoftwareGl) {
        this.afterDraw(done, 80);
      } else {
        done();
      }
    });
  }

  private startLoop(): void {
    if (this.isSoftwareGl) {
      // On-demand render + paced ambient tick on software WebGL so interactions never queue behind infinite draws
      this.requestRender();
      const ambientTick = () => {
        if (this.isDisposed) return;
        this.requestRender();
        this.ambientTimerId = window.setTimeout(ambientTick, 240);
      };
      this.ambientTimerId = window.setTimeout(ambientTick, 240);
      return;
    }

    const tick = () => {
      if (this.isDisposed) return;
      this.renderFrame();
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.clearTimeout(this.ambientTimerId);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    if (this.diorama) {
      this.scene.remove(this.diorama.root);
      this.diorama.dispose();
    }
    this.textures.dispose();
    this.envRT.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
