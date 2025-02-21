import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const ThreeScene: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        //getting the container dimensions and setting up the scene
        const width = mountRef.current?.clientWidth || 800;
        const height = mountRef.current?.clientHeight || 600;

        //setting up the scene
        const scene = new THREE.Scene();

        //setting up the camera
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 5;

        //setting up the renderer and adding it to the mount refrence container
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        mountRef.current?.appendChild(renderer.domElement);

        //creating a cube geometry and a basic material, then comine them into a mesh and add it to the scene
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshNormalMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        //setting up the animation loop
        const animate = () => {
            requestAnimationFrame(animate);

            cube.rotation.x += 0.001;
            cube.rotation.y += 0.001;

            renderer.render(scene, camera);
        };

        animate();

        //clean up the scene when the component is unmounted
        return () => {
            if (mountRef.current) {
                mountRef.current.removeChild(renderer.domElement);
            }
        };
    }, []);

    return <div ref={mountRef} style={{ width: "100%", height: "400px" }} />;
};

export default ThreeScene;