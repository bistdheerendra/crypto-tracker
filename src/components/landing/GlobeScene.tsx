"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { NewsItem } from "@/lib/types";

const CONTINENTS: [number, number][][] = [
  [[-168, 70], [-140, 72], [-115, 58], [-100, 50], [-82, 25], [-98, 16], [-118, 32], [-135, 52]],
  [[-82, 12], [-68, 8], [-50, -5], [-35, -22], [-55, -55], [-72, -42], [-78, -12]],
  [[-12, 36], [5, 44], [20, 55], [38, 68], [5, 72], [-10, 58]],
  [[-18, 36], [12, 37], [40, 12], [32, -34], [18, -36], [-5, 5]],
  [[30, 72], [90, 78], [150, 62], [160, 45], [125, 8], [105, 18], [80, 8], [58, 28], [35, 40]],
  [[110, -12], [145, -10], [154, -28], [132, -42], [112, -34]],
  [[-55, 82], [-20, 76], [-25, 60], [-50, 58]],
];

function pointInPolygon(lng: number, lat: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function toGlobePosition(lat: number, lng: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createGrid(radius: number) {
  const vertices: number[] = [];

  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lng = -180; lng < 180; lng += 3) {
      const a = toGlobePosition(lat, lng, radius);
      const b = toGlobePosition(lat, lng + 3, radius);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  for (let lng = -150; lng <= 180; lng += 30) {
    for (let lat = -90; lat < 90; lat += 3) {
      const a = toGlobePosition(lat, lng, radius);
      const b = toGlobePosition(lat + 3, lng, radius);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x3ea6ff, transparent: true, opacity: 0.1 })
  );
}

function createLand(radius: number) {
  const points: number[] = [];
  for (let lat = -58; lat <= 82; lat += 2.5) {
    for (let lng = -177.5; lng <= 177.5; lng += 2.5) {
      if (CONTINENTS.some((polygon) => pointInPolygon(lng, lat, polygon))) {
        const point = toGlobePosition(lat, lng, radius);
        points.push(point.x, point.y, point.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0x38a8e8,
      size: 0.024,
      transparent: true,
      opacity: 0.72,
      sizeAttenuation: true,
    })
  );
}

export function GlobeScene({ dots }: { dots: NewsItem[] }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 5.6);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    globe.rotation.set(THREE.MathUtils.degToRad(-8), THREE.MathUtils.degToRad(-22), 0);
    scene.add(globe);

    const ocean = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x061225,
        emissive: 0x020817,
        specular: 0x174d72,
        shininess: 24,
        transparent: true,
        opacity: 0.98,
      })
    );
    globe.add(ocean, createGrid(1.608), createLand(1.62));

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.72, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec3 vertexNormal;
          void main() {
            vertexNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vertexNormal;
          void main() {
            float intensity = pow(0.72 - dot(vertexNormal, vec3(0.0, 0.0, 1.0)), 2.4);
            gl_FragColor = vec4(0.08, 0.48, 0.82, 1.0) * intensity;
          }
        `,
      })
    );
    globe.add(atmosphere);

    const markerMeshes: THREE.Mesh[] = [];
    dots.forEach((item) => {
      const color =
        item.sentiment === "bullish" ? 0x2ee6a8 : item.sentiment === "bearish" ? 0xff5c72 : 0xf5b94a;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 18, 18),
        new THREE.MeshBasicMaterial({ color })
      );
      marker.position.copy(toGlobePosition(item.lat, item.lng, 1.67));
      marker.userData.phase = Math.random() * Math.PI * 2;
      markerMeshes.push(marker);
      globe.add(marker);
    });

    scene.add(new THREE.AmbientLight(0x5a8bb8, 1.5));
    const keyLight = new THREE.DirectionalLight(0x9dd8ff, 2.4);
    keyLight.position.set(-3, 3, 5);
    scene.add(keyLight);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / rect.width - 0.5;
      pointerY = (event.clientY - rect.top) / rect.height - 0.5;
    };
    mount.addEventListener("pointermove", onPointerMove);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      if (!reduceMotion) globe.rotation.y += 0.0015;
      globe.rotation.x += (THREE.MathUtils.degToRad(-8) - pointerY * 0.18 - globe.rotation.x) * 0.025;
      globe.rotation.z += (pointerX * 0.08 - globe.rotation.z) * 0.025;
      markerMeshes.forEach((marker) => {
        const scale = 1 + Math.sin(elapsed * 2.6 + marker.userData.phase) * 0.22;
        marker.scale.setScalar(scale);
      });
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mount.removeEventListener("pointermove", onPointerMove);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [dots]);

  return <div ref={mountRef} className="h-full w-full" />;
}
