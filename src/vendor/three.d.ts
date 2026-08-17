/**
 * Three.js 类型声明 - 通过 CDN importmap 加载
 */
declare module 'three' {
  export * from 'three/src/Three.d';
}

// 简化的类型声明，避免 TS 编译错误
declare module 'three' {
  // 核心类
  export class Scene {
    constructor();
    add(...object: Object3D[]): void;
    remove(...object: Object3D[]): void;
    background: any;
    environment: any;
    fog: any;
    children: Object3D[];
  }

  export class PerspectiveCamera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    position: Vector3;
    rotation: Euler;
    lookAt(x: number | Vector3, y?: number, z?: number): void;
    aspect: number;
    updateProjectionMatrix(): void;
  }

  export class WebGLRenderer {
    constructor(parameters?: any);
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setPixelRatio(value: number): void;
    render(scene: Scene, camera: Camera): void;
    shadowMap: { enabled: boolean; type: number };
    toneMapping: number;
    toneMappingExposure: number;
    outputColorSpace: string;
    domElement: HTMLCanvasElement;
    dispose(): void;
    setClearColor(color: any, alpha?: number): void;
  }

  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    visible: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    userData: any;
    parent: Object3D | null;
    children: Object3D[];
    add(...object: Object3D[]): this;
    remove(...object: Object3D[]): void;
    traverse(callback: (object: Object3D) => void): void;
    lookAt(x: number | Vector3, y?: number, z?: number): void;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
  }

  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }

  export class Group extends Object3D {
    constructor();
  }

  export class BufferGeometry {
    constructor();
    dispose(): void;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    rotateZ(angle: number): this;
    translate(x: number, y: number, z: number): this;
    scale(x: number, y: number, z: number): this;
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number, ...args: any[]);
  }

  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number, ...args: any[]);
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number, ...args: any[]);
  }

  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number, ...args: any[]);
  }

  export class TorusGeometry extends BufferGeometry {
    constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number, ...args: any[]);
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, widthSegments?: number, heightSegments?: number);
  }

  export class LatheGeometry extends BufferGeometry {
    constructor(points: Vector2[], segments?: number);
  }

  export class Material {
    constructor();
    color: Color;
    dispose(): void;
    transparent: boolean;
    opacity: number;
    visible: boolean;
  }

  export class MeshStandardMaterial extends Material {
    constructor(parameters?: any);
    roughness: number;
    metalness: number;
    emissive: Color;
    emissiveIntensity: number;
  }

  export class MeshPhongMaterial extends Material {
    constructor(parameters?: any);
    shininess: number;
    specular: Color;
  }

  export class MeshLambertMaterial extends Material {
    constructor(parameters?: any);
    emissive: Color;
  }

  export class Color {
    constructor(color?: number | string | Color);
    r: number;
    g: number;
    b: number;
    set(color: number | string | Color): this;
    setHex(hex: number): this;
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    multiplyScalar(scalar: number): this;
    distanceTo(v: Vector3): number;
    normalize(): this;
  }

  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
    set(x: number, y: number): this;
  }

  export class Euler {
    constructor(x?: number, y?: number, z?: number, order?: string);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }

  export class Light extends Object3D {
    constructor(color?: number, intensity?: number);
    color: Color;
    intensity: number;
    castShadow: boolean;
  }

  export class AmbientLight extends Light {
    constructor(color?: number, intensity?: number);
  }

  export class DirectionalLight extends Light {
    constructor(color?: number, intensity?: number);
    position: Vector3;
    target: Object3D;
    shadow: {
      mapSize: { width: number; height: number };
      camera: { near: number; far: number; left: number; right: number; top: number; bottom: number };
      bias: number;
      normalBias: number;
    };
  }

  export class PointLight extends Light {
    constructor(color?: number, intensity?: number, distance?: number, decay?: number);
    position: Vector3;
    distance: number;
    decay: number;
  }

  export class SpotLight extends Light {
    constructor(color?: number, intensity?: number, distance?: number, angle?: number, penumbra?: number, decay?: number);
    position: Vector3;
    target: Object3D;
    angle: number;
    penumbra: number;
    distance: number;
  }

  export class HemisphereLight extends Light {
    constructor(skyColor?: number, groundColor?: number, intensity?: number);
  }

  export class Raycaster {
    constructor();
    setFromCamera(coords: Vector2, camera: Camera): void;
    intersectObjects(objects: Object3D[], recursive?: boolean): Intersection[];
  }

  export interface Intersection {
    distance: number;
    point: Vector3;
    object: Object3D;
    face?: { normal: Vector3 };
    faceIndex?: number;
  }

  export type Camera = PerspectiveCamera | any;

  // Constants
  export const PCFSoftShadowMap: number;
  export const ACESFilmicToneMapping: number;
  export const SRGBColorSpace: string;
  export const DoubleSide: number;
  export const FrontSide: number;
  export const BackSide: number;
  export const ShadowMaterial: any;
  export const Fog: any;
  export const FogExp2: any;
}
