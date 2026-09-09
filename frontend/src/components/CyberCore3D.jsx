'use client';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

export default function CyberCore3D({ progress = 0, isExiting = false }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const coreGroupRef = useRef(null);
  const particlesRef = useRef(null);
  const cameraRef = useRef(null);
  const reqIdRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 7.5;
    cameraRef.current = camera;

    // 2. High-Performance WebGL Renderer with Alpha Transparency
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 3. Central Kinetic 3D Group
    const coreGroup = new THREE.Group();
    coreGroupRef.current = coreGroup;
    scene.add(coreGroup);

    // -------------------------------------------------------------
    // Layer A: Outer Polyhedral Wireframe Shell (Icosahedron)
    // -------------------------------------------------------------
    const outerGeo = new THREE.IcosahedronGeometry(2.1, 1);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x4F46E5, // Royal Indigo
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    coreGroup.add(outerMesh);

    // -------------------------------------------------------------
    // Layer B: Mid Octahedron Gyro Core (Emerald Accent)
    // -------------------------------------------------------------
    const midGeo = new THREE.OctahedronGeometry(1.4, 0);
    const midMat = new THREE.MeshBasicMaterial({
      color: 0x059669, // Emerald
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const midMesh = new THREE.Mesh(midGeo, midMat);
    coreGroup.add(midMesh);

    // -------------------------------------------------------------
    // Layer C: Glowing Polyhedral Vertex Nodes (Points)
    // -------------------------------------------------------------
    const nodeGeo = new THREE.IcosahedronGeometry(2.1, 1);
    const nodeMat = new THREE.PointsMaterial({
      color: 0x06B6D4, // Electric Cyan
      size: 0.08,
      transparent: true,
      opacity: 0.9,
    });
    const nodePoints = new THREE.Points(nodeGeo, nodeMat);
    coreGroup.add(nodePoints);

    // -------------------------------------------------------------
    // Layer D: Nested 3D Gyroscopic Orbital Rings (Torus)
    // -------------------------------------------------------------
    const ring1Geo = new THREE.TorusGeometry(2.8, 0.02, 16, 100);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x6366F1, // Indigo Light
      transparent: true,
      opacity: 0.6,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    ring1.rotation.y = Math.PI / 6;
    coreGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(3.1, 0.025, 16, 100);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x10B981, // Emerald Green
      transparent: true,
      opacity: 0.5,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.z = Math.PI / 4;
    coreGroup.add(ring2);

    const ring3Geo = new THREE.TorusGeometry(2.4, 0.015, 16, 100);
    const ring3Mat = new THREE.MeshBasicMaterial({
      color: 0x0EA5E9, // Sky Blue
      transparent: true,
      opacity: 0.7,
    });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.y = Math.PI / 2;
    coreGroup.add(ring3);

    // -------------------------------------------------------------
    // Layer E: Inner Pulsing Quantum Energy Sphere
    // -------------------------------------------------------------
    const innerCoreGeo = new THREE.SphereGeometry(0.65, 24, 24);
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0x0F172A,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const innerCoreMesh = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    coreGroup.add(innerCoreMesh);

    const centerPuckGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const centerPuckMat = new THREE.MeshBasicMaterial({
      color: 0x10B981,
    });
    const centerPuck = new THREE.Mesh(centerPuckGeo, centerPuckMat);
    coreGroup.add(centerPuck);

    // -------------------------------------------------------------
    // Layer F: 3D Floating Constellation Vortex (1000 Particles)
    // -------------------------------------------------------------
    const particleCount = 900;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleScales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 1.8 + Math.random() * 3.2;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      particleScales[i] = Math.random();
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x38BDF8,
      size: 0.045,
      transparent: true,
      opacity: 0.65,
      blending: THREE.NormalBlending,
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    particlesRef.current = particleSystem;
    coreGroup.add(particleSystem);

    // -------------------------------------------------------------
    // Interactive Mouse / Cursor Parallax Tracking
    // -------------------------------------------------------------
    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseRef.current.targetX = x * 0.45;
      mouseRef.current.targetY = y * 0.45;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Initial scale-up bounce
    gsap.from(coreGroup.scale, {
      x: 0,
      y: 0,
      z: 0,
      duration: 1.2,
      ease: 'elastic.out(1, 0.5)',
    });

    // -------------------------------------------------------------
    // 60FPS Render Loop
    // -------------------------------------------------------------
    let clock = new THREE.Clock();

    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse lerp
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Base Dynamic Rotations
      outerMesh.rotation.x = elapsedTime * 0.35 + mouseRef.current.y;
      outerMesh.rotation.y = elapsedTime * 0.5 + mouseRef.current.x;

      midMesh.rotation.x = -elapsedTime * 0.6;
      midMesh.rotation.z = elapsedTime * 0.45;

      nodePoints.rotation.x = outerMesh.rotation.x;
      nodePoints.rotation.y = outerMesh.rotation.y;

      ring1.rotation.z = elapsedTime * 0.7;
      ring2.rotation.y = -elapsedTime * 0.85;
      ring3.rotation.x = elapsedTime * 0.6;

      particleSystem.rotation.y = elapsedTime * 0.15;
      particleSystem.rotation.x = Math.sin(elapsedTime * 0.2) * 0.1;

      // Pulse Central Puck
      const pulse = 1 + Math.sin(elapsedTime * 4) * 0.15;
      centerPuck.scale.set(pulse, pulse, pulse);

      camera.position.x = mouseRef.current.x * 0.8;
      camera.position.y = mouseRef.current.y * 0.8;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // -------------------------------------------------------------
    // Resize Observer for Perfect Responsiveness
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
    // Cleanup on Unmount
    // -------------------------------------------------------------
    return () => {
      cancelAnimationFrame(reqIdRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      outerGeo.dispose();
      outerMat.dispose();
      midGeo.dispose();
      midMat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      ring3Geo.dispose();
      ring3Mat.dispose();
      innerCoreGeo.dispose();
      innerCoreMat.dispose();
      centerPuckGeo.dispose();
      centerPuckMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // -------------------------------------------------------------
  // Dynamic Reaction to Loading Progress (0 to 100)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!coreGroupRef.current) return;
    const progressFactor = progress / 100;
    
    // Scale up slightly and pulse faster as progress charges to 100%
    const targetScale = 1 + progressFactor * 0.28;
    gsap.to(coreGroupRef.current.scale, {
      x: targetScale,
      y: targetScale,
      z: targetScale,
      duration: 0.3,
      ease: 'power1.out',
    });
  }, [progress]);

  // -------------------------------------------------------------
  // Exit Shockwave / Hyperspace Warp when isExiting becomes true
  // -------------------------------------------------------------
  useEffect(() => {
    if (isExiting && coreGroupRef.current && particlesRef.current && cameraRef.current) {
      // 1. Hyperspace zoom camera & expand particles
      gsap.to(cameraRef.current.position, {
        z: 2.2,
        duration: 0.7,
        ease: 'expo.in',
      });

      gsap.to(particlesRef.current.scale, {
        x: 4.5,
        y: 4.5,
        z: 4.5,
        duration: 0.7,
        ease: 'expo.in',
      });

      // 2. Implode / Flash core
      gsap.to(coreGroupRef.current.scale, {
        x: 0.1,
        y: 0.1,
        z: 0.1,
        duration: 0.5,
        delay: 0.2,
        ease: 'power4.in',
      });
    }
  }, [isExiting]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative flex items-center justify-center pointer-events-none"
      style={{ minHeight: '320px', minWidth: '320px' }}
    />
  );
}
