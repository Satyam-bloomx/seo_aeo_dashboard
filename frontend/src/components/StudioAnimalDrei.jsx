'use client';
import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Float, ContactShadows, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

// Preload the models for instant rendering
useGLTF.preload('/models/Flamingo.glb');
useGLTF.preload('/models/Stork.glb');
useGLTF.preload('/models/Parrot.glb');

function Model({ modelPath, isExiting }) {
  const group = useRef();
  const { scene, animations } = useGLTF(modelPath);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    if (names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().fadeIn(0.5).play();
      actions[names[0]].timeScale = 1.15;
    }
    return () => {
      if (names.length > 0 && actions[names[0]]) {
        actions[names[0]].fadeOut(0.3);
      }
    };
  }, [actions, names]);

  // Dynamic swoop on exit
  useEffect(() => {
    if (isExiting && group.current) {
      if (names.length > 0 && actions[names[0]]) {
        actions[names[0]].timeScale = 2.4;
      }
      gsap.to(group.current.position, {
        x: 120,
        y: 80,
        z: 80,
        duration: 0.6,
        ease: 'power3.in',
      });
      gsap.to(group.current.rotation, {
        z: -0.6,
        x: -0.3,
        duration: 0.6,
        ease: 'power3.in',
      });
    }
  }, [isExiting, actions, names]);

  return (
    <group ref={group} dispose={null}>
      <primitive
        object={scene}
        scale={0.45}
        position={[0, -2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
    </group>
  );
}

function Scene({ modelPath, isExiting, mouse }) {
  const lightRef = useRef();

  useFrame((state) => {
    // Smooth camera parallax
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, mouse.current.x * 25, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 10 + mouse.current.y * 15, 0.05);
    state.camera.lookAt(0, 0, 0);

    // Subtle dynamic lighting motion
    if (lightRef.current) {
      lightRef.current.position.x = 40 + Math.sin(state.clock.elapsedTime) * 15;
    }
  });

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight
        ref={lightRef}
        position={[40, 60, 40]}
        intensity={2.8}
        color="#ffffff"
        castShadow
      />
      <directionalLight position={[-40, 20, -30]} intensity={1.5} color="#38bdf8" />
      <directionalLight position={[0, -30, 20]} intensity={1.0} color="#f472b6" />

      {/* Drei Organic Floating Motion */}
      <Float
        speed={2.2}
        rotationIntensity={0.6}
        floatIntensity={1.2}
        floatingRange={[-3, 3]}
      >
        <Model modelPath={modelPath} isExiting={isExiting} />
      </Float>

      {/* Drei Floating Ambient Light Sparkles */}
      <Sparkles
        count={65}
        scale={[60, 40, 40]}
        size={3.5}
        speed={0.4}
        opacity={0.4}
        color="#38bdf8"
      />

      {/* Drei Grounding Contact Shadows */}
      <ContactShadows
        position={[0, -22, 0]}
        opacity={0.35}
        scale={65}
        blur={2.5}
        far={35}
        color="#0f172a"
      />
    </>
  );
}

export default function StudioAnimalDrei({
  modelPath = '/models/Flamingo.glb',
  isExiting = false,
}) {
  const mouse = useRef({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    const { innerWidth, innerHeight } = window;
    mouse.current.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.current.y = -(e.clientY / innerHeight) * 2 + 1;
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 10, 110], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        className="w-full h-full"
      >
        <Scene modelPath={modelPath} isExiting={isExiting} mouse={mouse} />
      </Canvas>
    </div>
  );
}
