# 11. Three.js (WebGL 3D Interactive Graphics & Particle Pipelines)

## 1. Overview & Best Use Cases
**Three.js** is the industry standard JavaScript 3D WebGL library. It provides high-performance hardware-accelerated 3D rendering directly in the browser canvas.

### When to Use Three.js
- **Hero & Loading Experiences**: Holographic 3D geometric nodes, gyroscopic orbital rings, interactive wireframes, and particle constellation vortexes.
- **Complex Data Visualizations**: 3D spatial graphs, network cluster topologies, globe rendering, and kinetic particle fields.
- **Micro-Interactions**: Real-time cursor parallax tilt, dynamic lighting highlights, and particle shockwave explosions on milestone triggers.

---

## 2. Core Architecture & Concepts

### 1. Scene, Camera, & Renderer
```javascript
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

### 2. Geometry, Materials, & Mesh
- **Wireframe Polyhedrons**: `THREE.IcosahedronGeometry`, `THREE.OctahedronGeometry`, `THREE.TorusGeometry`.
- **Particles / Point Clouds**: `THREE.BufferGeometry` with `THREE.PointsMaterial` for lightweight thousands-of-particles rendering.
- **Lighting**: `THREE.AmbientLight` combined with dynamic `THREE.PointLight` / `THREE.DirectionalLight`.

---

## 3. React / Next.js Integration Patterns

### Clean Lifecycle Management (No Memory Leaks)
In React / Next.js, always initialize Three.js inside `useEffect` and dispose geometries, materials, textures, and renderer in the cleanup return function:

```jsx
'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function CyberCoreCanvas() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.z = 4;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Geometry + Material
    const geometry = new THREE.IcosahedronGeometry(1.2, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0x4F46E5,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      mesh.rotation.x += 0.005;
      mesh.rotation.y += 0.01;
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
```

---

## 4. Combining Three.js with GSAP Timelines

GSAP can tween any standard JavaScript object properties, including Three.js Vector3, mesh rotation, scale, particle opacity, and camera position:

```javascript
import gsap from 'gsap';

// Scale pulse
gsap.to(mesh.scale, {
  x: 1.5,
  y: 1.5,
  z: 1.5,
  duration: 1.2,
  ease: 'power2.inOut',
  yoyo: true,
  repeat: -1
});

// Hyperspace shockwave exit
gsap.to(particles.scale, {
  x: 8,
  y: 8,
  z: 8,
  duration: 0.8,
  ease: 'expo.in'
});
gsap.to(material, {
  opacity: 0,
  duration: 0.8,
  ease: 'power2.in'
});
```

---

## 5. Performance Checklist
1. **Pixel Ratio Clamping**: Always cap `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` to prevent mobile/4K GPU lag.
2. **BufferGeometry**: Always use `BufferGeometry` for custom coordinates.
3. **Disposal**: Always call `.dispose()` on all textures, materials, and geometries when unmounting.
4. **Transparent Canvases**: Use `alpha: true` on `WebGLRenderer` for seamless blending with CSS background gradients and grid patterns.
