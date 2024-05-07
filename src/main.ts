import "./style.css"

import * as THREE from "three"
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { CSG } from 'three-csg-ts';

import { BufferGeometryUtils, GLTFLoader } from "three/examples/jsm/Addons.js"

import { EffectComposer } from "three/examples/jsm/Addons.js";
import { RenderPass } from "three/examples/jsm/Addons.js";
import { OutputPass } from "three/examples/jsm/Addons.js";
import { OutlinePass } from "three/examples/jsm/Addons.js";
import { ShaderPass } from "three/examples/jsm/Addons.js";

import { GammaCorrectionShader } from "three/examples/jsm/Addons.js";

function toRadians(deg: number): number
{
    return deg / 180 * Math.PI
}

interface DebugInfo 
{
    fps: number;
    delta: number;
    vertices: number;
    additional: string;
}

class LiquidHolder
{
    public holderMesh = new THREE.Mesh();
    private originalBox = new THREE.Box3();
    private currentBox = new THREE.Box3();

    private originalSize = new THREE.Vector3();
    private originalCenter = new THREE.Vector3();

    private currentSize = new THREE.Vector3();
    private currentCenter = new THREE.Vector3();

    //@ts-ignore
    private liquidMesh: THREE.Mesh = null;

    private cylinder: THREE.Mesh;
    //@ts-ignore
    private fillCube: THREE.Mesh = null;

    constructor(holder: THREE.Mesh, private liquid: THREE.Material, public fill: number, public capacity: number)
    {
        this.holderMesh.copy(holder, true);

        deb.vertices += this.holderMesh.geometry.attributes.position.count
        
        this.originalBox.setFromObject(this.holderMesh);
        this.originalBox.getSize(this.originalSize);
        this.originalBox.getCenter(this.originalCenter);

        this.cylinder = new THREE.Mesh(new THREE.CylinderGeometry(this.originalSize.x / 2 * 0.9, this.originalSize.x / 2 * 0.9, this.originalSize.y * 0.85, 50, 25))
        this.cylinder.material = new THREE.MeshLambertMaterial({color: 0xff00ff, transparent: true, opacity: 0.2})

        scene.add(this.holderMesh);
        this.updateHelpers()

        this.cylinder.renderOrder = 1
        // let boundingBox = new THREE.Mesh(new THREE.BoxGeometry(this.currentSize.x, this.currentSize.y, this.currentSize.z, 4, 4, 4));
        // boundingBox.material = new THREE.MeshBasicMaterial({color: 0xffff00, transparent: true, opacity: 0.2, wireframe: true})
        //         // boundingBox.position.x = obj.position.x;
        //         // boundingBox.position.y = obj.position.y;
        //         // boundingBox.position.z = obj.position.z;
        // boundingBox.position.copy(this.holderMesh.position)
        // boundingBox.position.add(this.currentCenter)
        // //boundingBox.applyQuaternion(obj.quaternion)
        // scene.add(boundingBox)

        //scene.add(this.cylinder)


    }

    rotate(quat: THREE.Quaternion)
    {
        this.holderMesh.applyQuaternion(quat);
        this.updateHelpers();
    }

    translate(vec: THREE.Vector3)
    {
        //this.holderMesh.position.copy(vec)
        this.updateHelpers(vec, false);
    }

    getQuaternion(): THREE.Quaternion
    {
        return this.holderMesh.quaternion
    }

    private updateHelpers(pos: THREE.Vector3 = new THREE.Vector3(), updateBounds = true)
    {

        //let worldPos = this.holderMesh.position.sub(new THREE.Vector3(0, this.currentSize.y / 2).sub(this.currentCenter))
        //let initialPos = new THREE.Vector3();
        //initialPos.copy(this.holderMesh.position);
        if (updateBounds)
        {
            this.currentBox.setFromObject(this.holderMesh);
            this.currentBox.getSize(this.currentSize);
            this.currentBox.getCenter(this.currentCenter);
        }

        //this.holderMesh.position.copy(worldPos);

        this.holderMesh.position.copy(pos)

        //this.holderMesh.position.copy(initialPos)

        this.holderMesh.position.sub(this.originalCenter)
        this.holderMesh.position.y += this.originalSize.y / 2

        this.cylinder.position.copy(this.holderMesh.position)
        this.cylinder.position.add(this.originalCenter)
        //this.cylinder.applyMatrix4(this.holderMesh.matrixWorld)
        this.cylinder.quaternion.copy(this.holderMesh.quaternion);

        this.createFillCube();

        this.computeLiquid();

    }

    private createFillCube()
    {
        if(!this.fillCube)
        {
            console.log("new cube!");
            this.fillCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
            this.fillCube.material = new THREE.MeshLambertMaterial({color: 0xff0000, wireframe: true})    
        }

        let biggest = Math.max(...this.currentSize.toArray())
        //additional(`biggest: ${biggest}`)

        this.fillCube.scale.copy(new THREE.Vector3(biggest, this.currentSize.y * this.fill, biggest))
        
        this.fillCube.position.copy(this.holderMesh.position);
        this.fillCube.position.add(this.originalCenter)
        this.fillCube.position.y += this.currentSize.y * this.fill / 2 - this.currentSize.y / 2
        //scene.add(this.fillCube)
    }

    updateFill(fill: number)
    {
        this.fill = fill;
        this.createFillCube();
        this.computeLiquid();
    }

    private computeLiquid()
    {
        if (this.liquidMesh)
        {
            //console.log("RECOMPUTE!");
            scene.remove(this.liquidMesh);
            deb.vertices -= this.liquidMesh.geometry.attributes.position.count;
            this.liquidMesh.geometry.dispose();
            //console.log(scene.children)
        }

        this.cylinder.updateMatrix();
        this.fillCube.updateMatrix();
        this.holderMesh.updateMatrix();

        let res = CSG.intersect(this.cylinder, this.fillCube)
        //this.liquidMesh = CSG.subtract(res, this.holderMesh);
        
        //res = CSG.intersect(res, this.holderMesh)

        this.liquidMesh = res
        res.geometry.dispose();
        this.liquidMesh.material = this.liquid;
        this.liquidMesh.renderOrder = 1
        deb.vertices += this.liquidMesh.geometry.attributes.position.count;
        scene.add(this.liquidMesh);
    }
}

let deb: DebugInfo = {fps: 0, delta: 0, vertices: 0, additional: ""};

let box: THREE.Box3 = new THREE.Box3();

let beaker: THREE.Mesh;

//@ts-ignore
let holder: LiquidHolder = null;

const glftLoader = new GLTFLoader();

    glftLoader.load('./assets/glasses/beaker.gltf', (gltfScene) => {
        //loadedModel = gltfScene;
        // console.log(loadedModel);
    
        // gltfScene.scene.rotation.y = Math.PI / 8;
        // gltfScene.scene.position.y = 3;
        // gltfScene.scene.scale.set(10, 10, 10);
        
        gltfScene.scene.traverse((obj) =>
        {
            if (obj instanceof THREE.Mesh)
            {
                beaker = obj;
                //holder = new LiquidHolder(obj, new THREE.MeshLambertMaterial({color: 0x00ffff, wireframe: false, transparent: true, opacity: 0.5}), 0.5, 620);  
                //interactableObjects.push(holder.holderMesh)              
            }
        })

       
        //scene.add(gltfScene.scene);
        //scene.add(cylinder)
    });





let interactableObjects: THREE.Mesh[] = []



//@ts-ignore
const debugElm: HTMLElement = document.getElementById("debug");

const scene = new THREE.Scene();

const cam = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({
    //@ts-ignore
    canvas: document.getElementById("ctx")
})

let shaderPass = new ShaderPass(GammaCorrectionShader)

let hoverPass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, cam)
hoverPass.edgeGlow = 0.7
hoverPass.visibleEdgeColor.set(0x7289da)

let selectPass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, cam)
selectPass.visibleEdgeColor.set(0xffff00)

const composer = new EffectComposer(renderer);

composer.setSize(window.innerWidth, window.innerHeight)

composer.addPass(new RenderPass(scene, cam))
composer.addPass(hoverPass)
composer.addPass(selectPass)
composer.addPass(shaderPass)
// composer.addPass(outPass)

renderer.setSize(window.innerWidth, window.innerHeight);

cam.position.z = 20;
cam.position.y = 10;

// const geometry = new THREE.TorusGeometry(2, 0.5, 24, 96);
// const material = new THREE.MeshBasicMaterial({ color: 0x7289da, wireframe: true });
// const cube = new THREE.Mesh(geometry, material);
//scene.add(cube);


let tube = new THREE.CylinderGeometry(1, 1, 10, 50, 25, true);
let sphere =  new THREE.SphereGeometry(1, 50, 25, 0, Math.PI * 2, Math.PI / 2, Math.PI)
tube.translate(0, 0.5, 0)
sphere.translate(0, -4.5, 0)
let merged = BufferGeometryUtils.mergeGeometries([tube, sphere])

deb.vertices += merged.attributes.position.count

let tubeMesh =  new THREE.Mesh(merged);
tubeMesh.material = new THREE.MeshPhysicalMaterial({
    metalness: .9,
    roughness: .05,
    envMapIntensity: 0.9,
    clearcoat: 1,
    transparent: true,
    opacity: 0.5,
    reflectivity: 1,
    ior: 0.985,
    side: THREE.DoubleSide,
})


tubeMesh.renderOrder = 3
let tuber = new LiquidHolder(tubeMesh, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.7, color: 0x00ff80}), 0.5, 10)
interactableObjects.push(tuber.holderMesh)

//scene.add(tubeMesh)

const helper = new THREE.GridHelper(1000, 100)
scene.add( helper );

const ambient = new THREE.AmbientLight(0xffffff);
// const pinLight = new THREE.PointLight(0xffffff);
// pinLight.position.x = 7;
// pinLight.position.z = 10

// const lightHelper = new THREE.PointLightHelper(pinLight);
// scene.add(pinLight, lightHelper)
scene.add( ambient);

const controls = new OrbitControls( cam, renderer.domElement );

let sgn = 1;
let theta = 0

function render() {
    requestAnimationFrame(render);


    

    deb.delta = delta();
    if (tuber)
    {

        tuber.rotate(new THREE.Quaternion().setFromEuler(new THREE.Euler(toRadians(90 / 1000 * deb.delta), toRadians(270 / 1000 * deb.delta), toRadians(90 / 1000 * deb.delta))))
        // tuber.translate(new THREE.Vector3(5 * Math.cos(theta), 0, 5 * Math.sin(theta)))
        // theta += toRadians(180 / 1000 * deb.delta)
        // if (tuber.fill < 0.1)
        //     sgn = 1
        // if (tuber.fill > 0.7)
        //     sgn = -1
        // tuber.updateFill(tuber.fill + sgn * 0.2 / 1000 * deb.delta)
        additional(`Fill: ${(tuber.fill * tuber.capacity).toFixed(3)}mL`);
    }
    deb.fps = 1000 / deb.delta;
    deb.fps = parseFloat(deb.fps.toFixed(2));
    //deb.vertices = geometry.attributes.position.count;

    controls.update(deb.delta);

    printDebug(debugElm, deb);
    //cube.rotation.x += 0.01;
    //cube.rotation.y += 0.05;
    composer.render(deb.delta);
}

function printDebug(elm: HTMLElement, d: DebugInfo)
{
    elm.innerHTML = 
    `
    FPS: ${d.fps} (${d.delta}ms)
    <br>
    VERTICES: ${d.vertices}
    ${d.additional.length != 0 ? `<br>Additional:<br>&emsp;${d.additional.replace(/\n/g, "<br>&emsp;")}` : ``}
    `
}

function additional(s: string, d: DebugInfo = deb)
{
    d.additional = s;
}

let last = Date.now();
function delta(): number
{
    let now = Date.now();
    let t = now - last;
    last = now;

    return t;
}

renderer.domElement.addEventListener("mousemove", (e) =>
{
    let renderSize = new THREE.Vector2();
    renderer.getSize(renderSize);
    let mouse = new THREE.Vector2(e.clientX / renderSize.x, e.clientY / renderSize.y);
    mouse.x = mouse.x * 2 - 1;
    mouse.y = mouse.y * 2 - 1;
    mouse.y *= -1
    let raycaster = new THREE.Raycaster();
    //console.log(`mouse: [${mouse.toArray().map(el => el.toFixed(2))}]`)
    raycaster.setFromCamera(mouse, cam);
    let intersects = raycaster.intersectObjects(interactableObjects, false);
    if (intersects.length > 0)
    {
        for (let inter of intersects)
        {
            if (selectPass.selectedObjects.indexOf(inter.object) == -1)
                hoverPass.selectedObjects = [inter.object]
        }
        
    } else
        hoverPass.selectedObjects = []


})

renderer.domElement.addEventListener("mouseup", (e) =>
{
    let renderSize = new THREE.Vector2();
    renderer.getSize(renderSize);
    let mouse = new THREE.Vector2(e.clientX / renderSize.x, e.clientY / renderSize.y);
    mouse.x = mouse.x * 2 - 1;
    mouse.y = mouse.y * 2 - 1;
    mouse.y *= -1
    let raycaster = new THREE.Raycaster();
    //console.log(`mouse: [${mouse.toArray().map(el => el.toFixed(2))}]`)
    raycaster.setFromCamera(mouse, cam);
    let intersects = raycaster.intersectObjects(interactableObjects, false);
    if (intersects.length > 0)
    {
        let inter = intersects[0]
        
        let idx = selectPass.selectedObjects.indexOf(inter.object)
        if (idx != -1)
        {
            selectPass.selectedObjects.splice(idx, 1);
            hoverPass.selectedObjects = [inter.object]
        }
        else
        {
            selectPass.selectedObjects.push(inter.object)
            hoverPass.selectedObjects = []
        }
        
    } else
        selectPass.selectedObjects = []
})

window.addEventListener("resize", () =>
{
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight)
    hoverPass.setSize(window.innerWidth, window.innerHeight);
    selectPass.setSize(window.innerWidth, window.innerHeight);
    shaderPass.setSize(window.innerWidth, window.innerHeight);
    cam.aspect = window.innerWidth / window.innerHeight
    cam.updateProjectionMatrix()
})

render();
