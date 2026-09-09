'use client';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

export default function StudioCore3D({ progress = 0, isExiting = false }) {
  const mountRef = useRef(null);
  const reqIdRef = useRef(null);
  const meshGroupRef = useRef(null);
  const cameraRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 340;
    const height = container.clientHeight || 340;

    // 1. Scene & Perspective Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 6.2);
    cameraRef.current = camera;

    // 2. High-Fidelity WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // 3. Studio 3-Point Lighting Setup (Provides luxury metallic gloss & specular rims)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    // Key Light (Crisp Pure White)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(5, 5, 4);
    scene.add(keyLight);

    // Rim Light (Vivid Electric Indigo)
    const rimLight1 = new THREE.DirectionalLight(0x6366f1, 4.0);
    rimLight1.position.set(-5, 3, -3);
    scene.add(rimLight1);

    // Bottom Fill / Accent Light (Vivid Emerald Mint)
    const rimLight2 = new THREE.DirectionalLight(0x10b981, 3.5);
    rimLight2.position.set(0, -5, 2);
    scene.add(rimLight2);

    // Orbiting Point Light for Dynamic Specular Highlights
    const pointLight = new THREE.PointLight(0x38bdf8, 3.0, 15);
    pointLight.position.set(2, 2, 3);
    scene.add(pointLight);

    // 4. Central Kinetic Sculpture Group
    const meshGroup = new THREE.Group();
    meshGroupRef.current = meshGroup;
    scene.add(meshGroup);

    // -------------------------------------------------------------
    // Primary Mesh: Luxury Metallic Torus Knot (Smooth PBR Material)
    // -------------------------------------------------------------
    const torusKnotGeo = new THREE.TorusKnotGeometry(1.25, 0.38, 160, 32, 2, 3);
    const torusKnotMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a, // Deep Obsidian Slate
      metalness: 0.92,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      reflectivity: 0.95,
      ior: 1.6,
    });
    const torusMesh = new THREE.Mesh(torusKnotGeo, torusKnotMat);
    meshGroup.add(torusMesh);

    // -------------------------------------------------------------
    // Secondary Halo: Polished Floating Glass Gyroscope Ring
    // -------------------------------------------------------------
    const ringGeo = new THREE.TorusGeometry(2.35, 0.035, 32, 120);
    const ringMat = new THREE.MeshPhysicalMaterial({
      color: 0x6366f1,
      metalness: 0.8,
      roughness: 0.1,
      transmission: 0.4,
      clearcoat: 1.0,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.3,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3.5;
    ringMesh.rotation.y = Math.PI / 6;
    meshGroup.add(ringMesh);

    // Second Thin Accent Ring
    const ringGeo2 = new THREE.TorusGeometry(2.6, 0.02, 32, 120);
    const ringMat2 = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x059669,
      emissiveIntensity: 0.4,
    });
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.x = -Math.PI / 4;
    ringMesh2.rotation.z = Math.PI / 3;
    meshGroup.add(ringMesh2);

    // -------------------------------------------------------------
    // Delicate Ambient Floating Light Sparks (Minimal & Clean)
    // -------------------------------------------------------------
    const sparkCount = 120;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(sparkCount * 3);

    for (let i = 0; i < sparkCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const dist = 2.4 + Math.random() * 1.8;

      sparkPos[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      sparkPos[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      sparkPos[i * 3 + 2] = dist * Math.cos(phi);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));

    const sparkMat = new THREE.PointsMaterial({
      color: 0x6366f1,
      size: 0.05,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    meshGroup.add(sparks);

    // Initial Smooth Scale In
    gsap.from(meshGroup.scale, {
      x: 0,
      y: 0,
      z: 0,
      duration: 0.8,
      ease: 'power3.out',
    });

    // -------------------------------------------------------------
    // Mouse Parallax Interaction
    // -------------------------------------------------------------
    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseRef.current.targetX = x * 0.5;
      mouseRef.current.targetY = y * 0.5;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // -------------------------------------------------------------
    // 60FPS Fluid Render Loop
    // -------------------------------------------------------------
    const clock = new THREE.Clock();

    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth mouse lerp
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.06;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.06;

      // Elegant Continuous Motion
      torusMesh.rotation.x = elapsed * 0.55 + mouseRef.current.y;
      torusMesh.rotation.y = elapsed * 0.7 + mouseRef.current.x;

      // Levitation floating wave
      meshGroup.position.y = Math.sin(elapsed * 2.0) * 0.08;

      // Ring Counter-Rotations
      ringMesh.rotation.z = elapsed * 0.45;
      ringMesh2.rotation.y = -elapsed * 0.55;

      // Dynamic orbiting specular light
      pointLight.position.x = Math.cos(elapsed * 1.5) * 4;
      pointLight.position.y = Math.sin(elapsed * 1.5) * 4;
      pointLight.position.z = 3 + Math.sin(elapsed) * 1.5;

      sparks.rotation.y = elapsed * 0.15;

      camera.position.x = mouseRef.current.x * 0.6;
      camera.position.y = mouseRef.current.y * 0.6;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // -------------------------------------------------------------
    // Resize Handler
    // -------------------------------------------------------------
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // -------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------
    return () => {
      cancelAnimationFrame(reqIdRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      torusKnotGeo.dispose();
      torusKnotMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // -------------------------------------------------------------
  // Progress Modulation (Scale and energy)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!meshGroupRef.current) return;
    const progressFactor = progress / 100;
    const targetScale = 1 + progressFactor * 0.15;
    gsap.to(meshGroupRef.current.scale, {
      x: targetScale,
      y: targetScale,
      z: targetScale,
      duration: 0.2,
      ease: 'power2.out',
    });
  }, [progress]);

  // -------------------------------------------------------------
  // Exit Animation
  // -------------------------------------------------------------
  useEffect(() => {
    if (isExiting && meshGroupRef.current && cameraRef.current) {
      gsap.to(meshGroupRef.current.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 0.45,
        ease: 'power3.in',
      });
      gsap.to(cameraRef.current.position, {
        z: 9,
        duration: 0.45,
        ease: 'power3.in',
      });
    }
  }, [isExiting]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative flex items-center justify-center pointer-events-none"
      style={{ minHeight: '300px', minWidth: '300px' }}
    />
  );
}
