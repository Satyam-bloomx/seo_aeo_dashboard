'use client';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

export default function Animal3D({
  modelPath = '/models/Stork.glb',
  progress = 0,
  isExiting = false,
}) {
  const mountRef = useRef(null);
  const mixerRef = useRef(null);
  const modelRef = useRef(null);
  const reqIdRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 450;
    const height = container.clientHeight || 360;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 320);

    // 2. High-Performance WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    container.appendChild(renderer.domElement);

    // 3. Studio & Sunlight Lighting
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 2.0);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
    sunLight.position.set(150, 200, 150);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
    rimLight.position.set(-150, 50, -100);
    scene.add(rimLight);

    // 4. Load GLB Rigged Animal Model
    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        const model = gltf.scene.children[0];
        modelRef.current = model;

        // Scale & Position
        model.scale.set(0.65, 0.65, 0.65);
        model.position.set(0, -25, 0);
        model.rotation.y = Math.PI / 2; // Facing right/forward

        // Enhance Material Colors & Shadows
        if (model.material) {
          model.material.roughness = 0.4;
          model.material.metalness = 0.1;
        }

        scene.add(model);

        // Animation Mixer for Wing Flapping / Movement
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          const action = mixer.clipAction(gltf.animations[0]);
          action.timeScale = 1.25; // Smooth realistic flapping speed
          action.play();
        }

        // Entrance animation
        gsap.from(model.scale, {
          x: 0,
          y: 0,
          z: 0,
          duration: 0.6,
          ease: 'back.out(1.7)',
        });
      },
      undefined,
      (err) => {
        console.error('Error loading 3D animal model:', err);
      }
    );

    // 5. Mouse Parallax Banking
    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseRef.current.targetX = x;
      mouseRef.current.targetY = y;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 6. Animation Clock & Render Loop
    const clock = new THREE.Clock();

    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Update Animation Mixer (Wing Flap)
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      // Smooth Mouse Lerp
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Realistic Flight Path & Subtle Bank
      if (modelRef.current) {
        modelRef.current.position.y = -20 + Math.sin(elapsed * 2.5) * 12 + mouseRef.current.y * 20;
        modelRef.current.position.x = mouseRef.current.x * 35;
        
        // Flight Banking Angle
        modelRef.current.rotation.z = -mouseRef.current.x * 0.35 + Math.sin(elapsed * 2.5) * 0.08;
        modelRef.current.rotation.x = mouseRef.current.y * 0.25;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 7. Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 8. Cleanup
    return () => {
      cancelAnimationFrame(reqIdRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [modelPath]);

  // -------------------------------------------------------------
  // Exit Swoop Motion when isExiting is true
  // -------------------------------------------------------------
  useEffect(() => {
    if (isExiting && modelRef.current) {
      if (mixerRef.current) {
        // Flap faster when launching
        mixerRef.current.timeScale = 2.5;
      }

      // Swoop forward & upward gracefully
      gsap.to(modelRef.current.position, {
        x: 250,
        y: 180,
        z: 220,
        duration: 0.55,
        ease: 'power2.in',
      });

      gsap.to(modelRef.current.rotation, {
        z: -0.8,
        x: -0.4,
        duration: 0.55,
        ease: 'power2.in',
      });
    }
  }, [isExiting]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative flex items-center justify-center pointer-events-none"
      style={{ minHeight: '340px', minWidth: '340px' }}
    />
  );
}
