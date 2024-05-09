import "./style.css"

import * as THREE from "three"
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { CSG } from 'three-csg-ts';

import { BufferGeometryUtils, FBXLoader, FontLoader, GLTFLoader } from "three/examples/jsm/Addons.js"

import { EffectComposer } from "three/examples/jsm/Addons.js";
import { RenderPass } from "three/examples/jsm/Addons.js";
import { OutputPass } from "three/examples/jsm/Addons.js";
import { OutlinePass } from "three/examples/jsm/Addons.js";
import { ShaderPass } from "three/examples/jsm/Addons.js";

import { GammaCorrectionShader } from "three/examples/jsm/Addons.js";

import regression, { linear } from "regression"
import { Chart, ChartData } from "chart.js"
import { ScatterController, LinearScale, PointElement, LineController, LineElement } from "chart.js";
import { Tooltip, Legend, Title } from "chart.js";


Chart.register(ScatterController)
Chart.register(LineController)
Chart.register(LinearScale)
Chart.register(PointElement)
Chart.register(LineElement)
Chart.register(Tooltip)
Chart.register(Legend)
Chart.register(Title)

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

const water = "H<sub>2</sub>O";
const acid = "H<sub>2</sub>SO<sub>4</sub>"
const tio = "Na<sub>2</sub>S<sub>2</sub>O<sub>3</sub>"

let holderMap: Map<string, LiquidHolder> = new Map();

let colorMap: Map<string, number> = new Map();

/*
 0x07cce6}), 0.7, 620, 0.8, 0.95, "H<sub>2</sub>O");
    let holderAcid = new LiquidHolder(beakerModel, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.6, color:  0xdfe607}), 0.7, 620, 0.8, 0.95, "H<sub>2</sub>SO<sub>4</sub>");
    let holderNa = new LiquidHolder(beakerModel, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.7, color:  0xcdcfa9}
*/
colorMap.set(water, 0x07cce6);
colorMap.set(acid, 0xdfe607);
colorMap.set(tio, 0xcdcfa9);

class LiquidHolder
{
    public holderMesh = new THREE.Mesh();
    private originalBox = new THREE.Box3();
    private currentBox = new THREE.Box3();

    public originalSize = new THREE.Vector3();
    public originalCenter = new THREE.Vector3();

    public currentSize = new THREE.Vector3();
    public currentCenter = new THREE.Vector3();

    //@ts-ignore
    private liquidMesh: THREE.Mesh = null;

    private cylinder: THREE.Mesh;
    //@ts-ignore
    private fillCube: THREE.Mesh = null;

    private modified: boolean = false;

    public subs: Map<string, number> = new Map();

    public restingPosition: THREE.Vector3 = new THREE.Vector3;

    private particleGroup = new THREE.Group;

    private generationTimeout = 15 * 1000;

    constructor(holder: THREE.Mesh, private liquid: THREE.MeshLambertMaterial, public fill: number, public capacity: number, cylinderScale: number = 1, cylinderHeight: number = 1, substance: string = "H<sub>2</sub>O")
    {
        this.modified = true;
        this.holderMesh.copy(holder, true);

        this.subs.set(substance, this.fill);


        holderMap.set(this.holderMesh.uuid, this);

        deb.vertices += this.holderMesh.geometry.attributes.position.count
        
        this.originalBox.setFromObject(this.holderMesh);
        this.originalBox.getSize(this.originalSize);
        this.originalBox.getCenter(this.originalCenter);

        this.cylinder = new THREE.Mesh(new THREE.CylinderGeometry(this.originalSize.x / 2 * cylinderScale, this.originalSize.x / 2 * cylinderScale, this.originalSize.y * cylinderHeight, 50, 25))
        this.cylinder.material = new THREE.MeshLambertMaterial({color: 0xff00ff, transparent: true, opacity: 0.2})

        scene.add(this.holderMesh);
        this.updateHelpers()
        this.recomputeMesh()

        this.cylinder.renderOrder = 1
        scene.add(this.particleGroup)
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

    private restQuat = new THREE.Quaternion();

    restQuaternion(quat: THREE.Quaternion)
    {
        this.restQuat.copy(quat);
        this.rotate(this.restQuat);
    }

    rotate(quat: THREE.Quaternion)
    {
        let lastPos = new THREE.Vector3().copy(this.holderMesh.position);
        //lastPos.add(this.currentCenter);
        //lastPos.y -=this.originalSize.y / 2
        //let worldPos = this.holderMesh.position.sub(new THREE.Vector3(0, this.currentSize.y / 2).sub(this.currentCenter))
        //lastPos.applyQuaternion(q)
        //this.holderMesh.rotation.setFromQuaternion(quat)

        this.holderMesh.applyQuaternion(quat)
        this.updateHelpers(lastPos);
    }

    rest(vec: THREE.Vector3)
    {
        this.restingPosition.copy(vec);
        this.restingPosition.y += this.originalSize.y / 2
        this.translate(this.restingPosition);
    }

    returnToRest()
    {
        this.translate(this.restingPosition)
        this.holderMesh.quaternion.copy(this.restQuat);
    }

    private targetPosition: THREE.Vector3 = new THREE.Vector3();
    private alpha: number = 0;
    private lerpSpeed: number = 1 / 1000;
    translate(vec: THREE.Vector3, lerpSpeed: number = 1/1000)
    {
        //.add(new THREE.Vector3(0, this.currentSize.y / 2))
        this.targetPosition.copy(vec);
        this.alpha = 0;
        this.lerpSpeed = lerpSpeed
        //this.targetPosition.y += this.originalSize.y / 2

        //this.holderMesh.position.copy(vec)
        //this.updateHelpers(this.holderMesh.position, false);
    }

    setQuaternion(quat: THREE.Quaternion)
    {
        this.holderMesh.quaternion.copy(quat);
        this.updateHelpers(this.holderMesh.position)
    }

    getQuaternion(): THREE.Quaternion
    {
        return this.holderMesh.quaternion
    }

    private updateHelpers(pos: THREE.Vector3 = new THREE.Vector3(), updateBounds = true)
    {

        //this.holderMesh.position.sub(new THREE.Vector3(0, 0, 0).add(this.currentCenter))
        //let initialPos = new THREE.Vector3();
        //initialPos.copy(this.holderMesh.position);
        if (updateBounds)
        {
            this.currentBox.setFromObject(this.holderMesh);
            this.currentBox.getSize(this.currentSize);
            this.currentBox.getCenter(this.currentCenter);
        }

        //this.holderMesh.position.copy(worldPos);

        //this.holderMesh.position.copy(pos)
        // this.holderMesh.translateX(pos.x)
        // this.holderMesh.translateY(pos.y)
        // this.holderMesh.translateZ(pos.z)

        //this.holderMesh.position.copy(initialPos)

        //this.holderMesh.position.add(this.originalCenter)
        //this.holderMesh.position.y += this.originalSize.y / 2

        this.cylinder.position.copy(this.holderMesh.position)
        this.cylinder.position.add(this.originalCenter)

        //this.cylinder.applyMatrix4(this.holderMesh.matrixWorld)
        this.cylinder.quaternion.copy(this.holderMesh.quaternion);
        this.modified = true;

        this.particleGroup.position.copy(this.holderMesh.position)
        this.particleGroup.position.add(this.originalCenter)
        this.particleGroup.quaternion.copy(this.holderMesh.quaternion);

        //this.createFillCube();

        //this.computeLiquid();

    }


    private particleTimer = 0;
    private particleSpeed = 1;

    public reacted = false;
    public isReacting = false;

    private particleMaterial = new THREE.MeshBasicMaterial({color: 0xff00ff})

    generateParticle()
    {
        if (this.reacted)
            return;

        if (this.generationTimeout <= 0)
        {
            this.reacted = true;
            this.isReacting = false;
            return;
        }

        this.isReacting = true;
        this.particleTimer += deb.delta;

        if (this.particleTimer < 500 / this.particleSpeed)
            return;

        this.generationTimeout -= deb.delta;
        this.particleSpeed+= 0.1;
        this.particleTimer = 0;

        let coord = new THREE.Vector3()
        let radius = Math.sqrt(Math.pow(this.currentSize.x * 0.25, 2) + Math.pow(this.currentSize.z * 0.25, 2)); 
        radius *= 0.85
        coord.add(new THREE.Vector3(
            Math.random() * radius * Math.cos(Math.random() * 2 * Math.PI),
            Math.random() * this.currentSize.y * 2 / 3 - this.currentSize.y / 3, 
            Math.random() * radius * Math.sin(Math.random() * 2 * Math.PI),
        ))

        let mesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075 , 0.075), this.particleMaterial)
        mesh.position.copy(coord);
        this.particleGroup.add(mesh)

    }

    getFillage(substance: string = "H<sub>2</sub>O") : number
    {
        return this.subs.get(substance) || 0;
    }

    exchangeLiquid(other: LiquidHolder, angle: number)
    {
        if (angle <= 0 || this.fill == 0)
            return;

        let limitAngle = (1 - this.fill) * 90;
        let liqspd = 15 / 1000 * (other.capacity / this.capacity);
        if (angle > limitAngle)
        {
            let diff = angle - limitAngle;
            let interval = 90 - limitAngle;
            let perc = diff / interval;
            for (let sub of this.subs)
            {

                let exchange = liqspd * perc * (sub[1] / this.fill)
                let equiv = exchange * (this.capacity / other.capacity)
                if (exchange > this.getFillage(sub[0]))
                    exchange = this.getFillage(sub[0]);

                if (other.fill + equiv < 1)
                    other.updateFill(other.getFillage(sub[0]) + equiv, sub[0])

                this.updateFill(sub[1] - exchange, sub[0])
                //console.log(sub[1] - exchange);
                if (this.getFillage(sub[0]) < 0)
                    this.updateFill(0, sub[0])

            }

        } else if (angle >= 90)
        {
            for (let sub of this.subs)
            {
                if (sub[1] <= 0)
                    continue;
                let exchange = liqspd * (sub[1] / this.fill)
                let equiv = exchange * (this.capacity / other.capacity)

                if (exchange > this.getFillage(sub[0]))
                    exchange = this.getFillage(sub[0]);

                if (other.fill + equiv < 1)
                    other.updateFill(other.getFillage(sub[0]) + equiv, sub[0])


                this.updateFill(sub[1] - exchange, sub[0])
                if (this.getFillage(sub[0]) < 0)
                    this.updateFill(0, sub[0])

            }
        }
    }

    private createFillCube()
    {
        if(!this.fillCube)
        {
            //console.log("new cube!");
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

    private computeFillage()
    {
        this.fill = 0


        for (let sb of this.subs)
        {
            if (isNaN(sb[1] ) || sb[1] == 0)
            {
                this.subs.delete(sb[0]);
                continue;
            }
            //@ts-ignore
            this.fill += sb[1];
            //console.log(sb);
        }

    }

    updateFill(fill: number, subs: string = "H<sub>2</sub>O")
    {
        //this.fill = fill;
        this.subs.set(subs, fill);
        this.computeFillage();
        this.modified = true;
        //this.createFillCube();
        //this.computeLiquid();
    }


    recomputeMesh()
    {
        if (this.alpha <= 1)
        {
            //console.log("lerp!");
            this.holderMesh.position.lerp(this.targetPosition, this.alpha);
            if (loaded)
                this.alpha += this.lerpSpeed * deb.delta
            else
                this.alpha = 1;

            this.updateHelpers(this.holderMesh.position, false);
            
        }
        //console.log(`${this.targetPosition.toArray().map(el => el.toFixed(2))} vs ${this.holderMesh.position.toArray().map(el => el.toFixed(2))}`);
        if (!this.modified)
            return;
        this.createFillCube();
        this.computeLiquid();

        this.modified = false;

    }


    private computeLiquid()
    {
        if (this.liquidMesh) //stergerea geometriei vechi
        {
            scene.remove(this.liquidMesh);
            deb.vertices -= this.liquidMesh.geometry.attributes.position.count;
            this.liquidMesh.geometry.dispose();
        }

        this.cylinder.updateMatrix();
        this.fillCube.updateMatrix();
        this.holderMesh.updateMatrix();

        //intersectia dintre geometriile ajutatoare
        let res = CSG.intersect(this.cylinder, this.fillCube)

        this.liquidMesh = res
        res.geometry.dispose();
        this.liquidMesh.material = this.liquid;
        this.liquidMesh.renderOrder = 1
        deb.vertices += this.liquidMesh.geometry.attributes.position.count;
        scene.add(this.liquidMesh);
    }
}

let deb: DebugInfo = {fps: 0, delta: 0, vertices: 0, additional: ""};

let loaded = false;

let box: THREE.Box3 = new THREE.Box3();

let holders: LiquidHolder[] = [];

//@ts-ignore
let holder: LiquidHolder = null;

let interaction: LiquidHolder[] = [];


const glftLoader = new GLTFLoader();




let interactableObjects: THREE.Mesh[] = []

//@ts-ignore
let tuber: LiquidHolder = null;

//@ts-ignore
const debugElm: HTMLElement = document.getElementById("debug");

const scene = new THREE.Scene();

const cam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({
    //@ts-ignore
    canvas: document.getElementById("ctx")
})

let shaderPass = new ShaderPass(GammaCorrectionShader)

let hoverPass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, cam)
hoverPass.edgeGlow = 0.7
hoverPass.visibleEdgeColor.set(0x28587B)

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




// const geometry = new THREE.TorusGeometry(2, 0.5, 24, 96);
// const material = new THREE.MeshBasicMaterial({ color: 0x28587B, wireframe: true });
// const cube = new THREE.Mesh(geometry, material);
//scene.add(cube);





//const helper = new THREE.GridHelper(1000, 100)
//scene.add( helper );

const pourBtn = document.getElementById("pour");
const returnBtn = document.getElementById("return");
const holderCapacity = document.getElementById("capacity")

const ambient = new THREE.AmbientLight(0xffffff);
// const pinLight = new THREE.PointLight(0xffffff);
// pinLight.position.x = 7;
// pinLight.position.z = 10

// const lightHelper = new THREE.PointLightHelper(pinLight);
// scene.add(pinLight, lightHelper)
scene.add( ambient);

const controls = new OrbitControls( cam, renderer.domElement );
controls.enabled = false;

let sgn = 1;
let theta = 0

let q = new THREE.Quaternion().setFromEuler(new THREE.Euler(toRadians(90 / 1000 * deb.delta), toRadians(270 / 1000 * deb.delta), toRadians(90 / 1000 * deb.delta)))

let pouring = false;
let degs = 0;

let mixBtn = document.getElementById("mix")
let reaction = false;

let notebook = document.getElementById("notebook")
let openNote = document.getElementById("open1");

let chartElement = document.getElementById("chart")
let openChart = document.getElementById("open2");

let tutorial = document.getElementById("tutorial");
let openTutorial = document.getElementById("open3");

//@ts-ignore
let resultsElement: HTMLDivElement = document.getElementById("results")

let tutorialOpened = false;

let tutorialFlash = setInterval(() =>
{
    if (tutorialOpened)
    {
        //@ts-ignore
        openTutorial.style.background = "#FFE45E"
        clearInterval(tutorialFlash);
        return
    }

    //@ts-ignore
    if (openTutorial.style.background == "rgb(255, 228, 94)")
    {
        //@ts-ignore
        openTutorial.style.background = "#fafafa"
    } else
    {
        //@ts-ignore
        openTutorial.style.background = "#FFE45E"
    }

}, 750)

openTutorial?.addEventListener("click", () =>
{
    if (!tutorialOpened)
        tutorialOpened = true;

    notebook?.classList.remove("cover")
    if (tutorial?.classList.contains("cover"))
    {
        tutorial?.classList.remove("cover")
        openTutorial.style.background = ""
    }
    else
    {
        openTutorial.style.background = "#FFE45E"
        tutorial?.classList.add("cover")
    }
})

let chartOpened = false;


openChart?.addEventListener("click", () =>
{

    if (!chartOpened)
        chartOpened = true;

    if (chartElement?.classList.contains("cover"))
    {
        chartElement?.classList.remove("cover")
        openChart.style.background = ""
    }
    else
    {
        openChart.style.background = "#87da72"
        chartElement?.classList.add("cover")
    }
})

//notebook?.addEventListener()
openNote?.addEventListener("click", () =>
{
    if (notebook?.classList.contains("cover"))
    {
        notebook.classList.remove("cover")
        openNote.style.background = ""
    }
    else
    {
        openNote.style.background = "#28587B"
        notebook?.classList.add("cover")
    }
})

let idx = 1;



let results: [number, number][] = []
// [
//     [-0.3, -1.39],
//     [-0.39, -1.44],
//     [-0.52, -1.6],
//     [-0.69, -1.79],
    
// ]; 

const mixLimit = 3 * 1000;

function animateMix()
{
    let animationTime = 0;
    let aspeed = 60 / 2 / 1000
    let aq = new THREE.Quaternion().setFromEuler(new THREE.Euler(toRadians(aspeed * deb.delta), toRadians(aspeed * 32 * deb.delta), toRadians(aspeed * 1.2 * deb.delta)))
    let inter = setInterval(() =>
    {
        if (animationTime >= mixLimit)
        {
            interaction[1].setQuaternion(new THREE.Quaternion());
            execReact = true;
            reaction = true;
            clearInterval(inter);
            return;
        }
        interaction[1].rotate(aq)
        animationTime += deb.delta;
    }, 10)
}

mixBtn?.addEventListener("mouseup", (e) =>
{
    if (totalTime < computeTime(interaction[1]) && !execReact)
    {
        animateMix();
    }
    else //if (computeTime(interaction[1]) < totalTime)
    {
        reaction = false;
        // if (results.length > 4)
        //     return;

        let lt = Math.log10(totalTime / 1000);
        let lc = Math.log10(interaction[1].getFillage(tio))

        results.push([lc, -lt])

        //@ts-ignore
        //notebook.innerHTML += `T<sub>${idx}</sub> = ${(totalTime / 1000).toFixed(2)}s<br>C<sup>${idx}</sup><sub>${tio}</sub> = ${interaction[1].getFillage(tio).toFixed(2)}M<br><br>`
        //@ts-ignore 
        resultsElement.innerHTML += `\\[t_{${idx}} = ${(totalTime / 1000).toFixed(2)}s \\implies -\\log_{10}(t_{${idx}}) = ${-lt.toFixed(2)}\\]`
        //@ts-ignore
        resultsElement.innerHTML += `\\[c_{Na_2S_2O_3} = ${interaction[1].getFillage(tio).toFixed(2)}M \\implies \\log_{10}(c_{Na_2S_2O_3}) = ${lc.toFixed(2)}\\]<br>`
        //@ts-ignore
        totalTime = 0;
        idx++;
        //console.log(results);
        //notebook?.classList.add("cover")
        openNote?.click();

        if (results.length >= 2)
        {
            computeChart();
            openChart?.classList.remove("hidden")
        }

    }

    //@ts-ignore
    MathJax.startup.promise.then(() => {
        //@ts-ignore
        MathJax.typesetClear();
        //@ts-ignore
        MathJax.typeset();
    })

    

})

//@ts-ignore
let orderElement: HTMLDivElement = document.getElementById("order");

//@ts-ignore
let chart: Chart = null;

function computeChart()
{
    let res = regression.linear(results);
    let gradient = res.equation[0];
    let yinter = res.equation[1];

    let biggest = -Infinity;
    let smallest = Infinity;

    results.forEach((el) =>
    {
        if (el[0] > biggest)
            biggest = el[0]
        if (el[0] < smallest)
            smallest = el[0]
    })

    smallest -= 0.2
    biggest += 0.2

    let data: ChartData = 
    {
        datasets:
        [
            {
                type: 'scatter',
                label: "Punct experimental",
                data: results.map(el => {return {x: el[0], y: el[1]}}),
                backgroundColor: "#28587B",
                pointRadius: 5
            },
            {
                type: 'line',
                label: "Aproximare",
                data: 
                [
                    {x: smallest, y: gradient * smallest + yinter},
                    {x: biggest, y: gradient * biggest + yinter}
                ],
                backgroundColor: "#212121",
                borderColor: "#212121"
            }
        ]
    };

    if (chart != null)
    {
        chart.destroy()
    }

    //@ts-ignore
    chart = new Chart(
        //@ts-ignore
        document.getElementById("c_canv").getContext("2d"),
        {
            type: 'scatter',
            data: data,
            options: 
            {
                scales: 
                {
                  x: 
                  {
                    type: 'linear',
                    position: 'bottom'
                  }
                },
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Dependența Timp - Concentrație`
                    }
                },
                elements:
                {
                    line:
                    {
                        borderDash: [10, 5],
                        borderWidth: 1
                    }
                }
            }
            
        }
    )

    chartOpened = false;

    let chartFlash = setInterval(() =>
        {
            if (chartOpened)
            {
                //@ts-ignore
                openChart.style.background = "#87da72"
                clearInterval(chartFlash);
                return
            }
        
            //@ts-ignore
            if (openChart.style.background == "rgb(135, 218, 114)")
            {
                //@ts-ignore
                openChart.style.background = "#fafafa"
            } else
            {
                //@ts-ignore
                openChart.style.background = "#87da72"
            }
        
        }, 750)

    chart.render();
    

    let linearf = (n: number) => gradient * n + yinter;

    let ax = smallest;
    let bx = biggest;
    let ay = linearf(smallest);
    let by = linearf(biggest);

    let kp = Math.pow(10, linearf(0));

    orderElement.innerHTML = `<br>\\[\\log_{10}(k^\\prime) = f(0) = ${linearf(0).toFixed(2)} \\implies k^\\prime = ${Math.pow(10, linearf(0)).toFixed(3)} \\]\\[m = \\frac{${by.toFixed(2)} - ${ay < 0 ? "(" : ""}${ay.toFixed(2)}${ay < 0 ? ")" : ""}}{${bx.toFixed(2)} - ${ax < 0 ? "(" : ""}${ax.toFixed(2)}${ay < 0 ? ")" : ""}} = ${gradient.toFixed(2)} \\sim ${Math.round(gradient)} = a\\]\\[t_{\\frac{1}{2}} = \\frac{ln2}{k^\\prime} = \\frac{${Math.LN2.toFixed(3)}}{${kp.toFixed(3)}} = ${(Math.LN2 / kp).toFixed(3)}s\\]`

    //@ts-ignore
    MathJax.startup.promise.then(() => {
        //@ts-ignore
        MathJax.typesetClear();
        //@ts-ignore
        MathJax.typeset();
    })

}

returnBtn?.addEventListener("mouseup", (e) =>
{
    notebook?.classList.remove("cover")
    clearInteraction()
})

//let pourspd = 0.1

pourBtn?.addEventListener("mousedown", () =>
{
    pouring = true;
    //console.log("pour");

})

pourBtn?.addEventListener("mouseup", () =>
{
    notebook?.classList.remove("cover")
    pouring = false;
    //console.log("stop!");

})

let rotSpeed = 45 / 1000


function render() {
    requestAnimationFrame(render);
    
    deb.delta = delta();

    react();

    if (pouring)
    {
        if (degs <= 90)
        {
            degs += rotSpeed * deb.delta;
            interaction[0].rotate(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, toRadians(rotSpeed * deb.delta))))
        }
    } else if (interaction.length > 1)
    {
        if (degs > 0)
        {
            let nxt = rotSpeed * deb.delta;
            if (nxt < degs)
                degs -= rotSpeed * deb.delta
            else
                degs = 0;
            interaction[0].rotate(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -toRadians(rotSpeed * deb.delta))))
        }
    }
   
    if (interaction.length > 1)
        interaction[0].exchangeLiquid(interaction[1], degs)


    if (interaction.length >= 1 && !reaction)
    {
        //@ts-ignore
        holderCapacity.innerHTML = `${(interaction[1].fill * interaction[1].capacity).toFixed(2)} mL`
        //<br><sub>${interaction[1].getFillage(tio).toFixed(2)}M</sub>
        

    } 
    if (interaction.length > 1)
    {
        //console.log(`cond: ${interaction[1].fill * interaction[1].capacity}, ${interaction[1].getFillage(tio)}, ${interaction[1].getFillage(acid) * interaction[1].capacity}`);
    
        if (interaction[1].fill * interaction[1].capacity >= 10, interaction[1].getFillage(tio) > 0 && interaction[1].getFillage(acid) * interaction[1].capacity > 4.9)
        {
            mixBtn?.classList.remove("hidden")
            if (!reaction)
            {
                //@ts-ignore
                mixBtn.innerHTML = "START"
            } else
            {
                //@ts-ignore
                mixBtn.innerHTML = "STOP"

            }
        }
        else
        {
            mixBtn?.classList.add("hidden")
        }
        if (interaction[1].reacted || results.length > 4)
            mixBtn?.classList.add("hidden")
    } else
    {
        mixBtn?.classList.add("hidden")
    }

    deb.fps = 1000 / deb.delta;
    deb.fps = parseFloat(deb.fps.toFixed(2));

    //controls.update(deb.delta);

    holders.forEach(h => {h.recomputeMesh()})
    
    composer.render(deb.delta);
    loaded = true;
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

const tooltipElement = document.getElementById("tooltip");

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
        document.body.style.cursor = "pointer";
        let inter = intersects[0];
        let hld = holderMap.get(inter.object.uuid);
        let str = "";

        //@ts-ignore
        for (let sb of hld.subs)
        {
            if (sb[1] <= 0)
                continue;
            //@ts-ignore
            str += `${sb[0]} (${(sb[1]* hld.capacity).toFixed(2)})mL + `
            
        }
        if (str.length == 0)
            str = "Golll"
        //@ts-ignore
        tooltipElement.innerHTML = str.substring(0, str.length - 2)
        //console.log(str)
        //@ts-ignore
        tooltipElement.classList.remove("hidden");
        hoverPass.selectedObjects = [inter.object]
        
    } else
    {
        document.body.style.cursor = "default";

        hoverPass.selectedObjects = []
        //@ts-ignore
        tooltipElement.classList.add("hidden");
        
    }


})


function computeTime(obj: LiquidHolder): number
{
    //tio = tiosulfat de sodiu
    if (obj.getFillage(tio) == 0)
        return 10000;

    //126 / V(mL)
    return 126 / (obj.getFillage(tio) * obj.capacity) * 1000
}

let totalTime = 0;
let execReact = false;

function react()
{
    if (!execReact)
        return;
    if (interaction.length < 2)
        return;

    if (interaction[1].reacted)
        return;

    if (totalTime >= computeTime(interaction[1]) || interaction[1].isReacting)
        {
            //console.log(("GATAAA"));
            //console.log(totalTime);
            //reaction = false;
            interaction[1].generateParticle();
        }

    if (!reaction)
        return;


    if (holderCapacity)
    {
        //@ts-ignore
        holderCapacity.innerHTML = `${(totalTime / 1000).toFixed(2)}s`;
    }
    totalTime += deb.delta;
    //console.log(totalTime);

    

}

function clearInteraction()
{
    //console.log(interaction);
    interaction[0].returnToRest();
    if (execReact)
        interaction[1].reacted = true;
    interaction[1].returnToRest();
    interaction = []
    pourBtn?.classList.add("hidden");
    returnBtn?.classList.add("hidden");
    holderCapacity?.classList.add("hidden");
    execReact = false;

}

function interact()
{
    if (selectPass.selectedObjects.length < 2)
        return;
    if (interaction.length > 1)
    {
       clearInteraction();
    }
    degs = 0;
    pourBtn?.classList.remove("hidden");
    returnBtn?.classList.remove("hidden");
    holderCapacity?.classList.remove("hidden");

    //console.log(selectPass.selectedObjects.length);
    //@ts-ignore
    interaction = (selectPass.selectedObjects.map(el => holderMap.get(el.uuid)))
    // console.log("Interaction!!");
    // console.log(interaction);
    //let h1 = holderMap.get()
    interaction[1].translate(new THREE.Vector3(controls.target.x, controls.target.y + interaction[1].currentSize.y / 2, 0));
    let biggest = Math.max(...interaction[0].currentSize.toArray())
    interaction[0].translate(new THREE.Vector3(controls.target.x, controls.target.y, 0).add(new THREE.Vector3(0 + interaction[1].currentSize.x / 2 + biggest * 0.7, interaction[1].currentSize.y / 2 + interaction[0].currentSize.y * 0.75, 0)))
    //controls.target.copy(interaction[1].holderMesh.position)

    //interaction = [];
    selectPass.selectedObjects = []

}



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
            interact();
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

    //@ts-ignore
    MathJax.startup.promise.then(() => {
        //@ts-ignore
        MathJax.typesetClear();
        //@ts-ignore
        MathJax.typeset();
    })

})

async function getMesh(url: string): Promise<THREE.Mesh>
{
    return new Promise<THREE.Mesh>(async (resolve, reject) =>
    {
        let gltfScene = await glftLoader.loadAsync(url);
        gltfScene.scene.traverse((obj) =>
        {
            if (obj instanceof THREE.Mesh)
            {
                resolve(obj);
                return;
            }
        })
        reject(`Scene does not contain mesh [${url}]`)
    })
}


async function setup()
{
    //@ts-ignore
    let loader: HTMLDivElement = document.getElementById("loader");
    let st = "-- ..--- ----."
    let idx = 0;
    let tanim = setInterval(() =>
    {
        if (idx >= st.length)
        {
            loader.style.opacity = "0";
            loader.addEventListener("transitionend", function list()
            {
                loader.classList.add("hidden")
                loader.removeEventListener("transitionend", list);
            })
            clearInterval(tanim);
            return;
        }
        loader.innerHTML += st[idx];
        idx++;

    }, 100)
    
    //let table = await getMesh("./assets/table/table3.gltf");
    let table = (await glftLoader.loadAsync("./assets/table/table3.gltf")).scene;
    table.rotateY(toRadians(180))
    table.scale.setScalar(50)
    scene.add(table);

    let tableSize = new THREE.Vector3;
    let tableCenter = new THREE.Vector3;
    let tableBox = new THREE.Box3().setFromObject(table);
    tableBox.getSize(tableSize)
    tableBox.getSize(tableCenter)

    table.position.y += tableSize.y / 2
    //table.position.x = -25

    //table.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, toRadians(35), 0)))

    //scene.add(new THREE.BoxHelper(table))

    let holder1 = (await glftLoader.loadAsync("./assets/holder/holder.gltf")).scene
    holder1.scale.setScalar(1)
    let holder2 = holder1.clone();

    let holderSize = new THREE.Vector3();
    let holderCenter = new THREE.Vector3();
    let holderBox = new THREE.Box3().setFromObject(holder1);
    holderBox.getSize(holderSize)
    holderBox.getCenter(holderCenter)

    holder1.rotation.setFromQuaternion(table.quaternion)
    holder2.rotation.setFromQuaternion(holder1.quaternion)


    holder1.position.copy(new THREE.Vector3(table.position.x, table.position.y + tableSize.y / 2 * 0.5, table.position.z - tableSize.z / 2 * 0.9))
    holder2.position.copy(new THREE.Vector3().copy(holder1.position).add(new THREE.Vector3(holderSize.x + 1, 0, 0)))
    scene.add(holder1)
    scene.add(holder2)

    
    //Beakers


    //scene.add(beakerModel)


    //skybox

    let pth = "./assets/skybox/"

    let urls = 
    [
        pth + "px.png",
        pth + "nx.png",
        pth + "py.png",
        pth + "ny.png",
        pth + "pz.png",
        pth + "nz.png",
    ]


    scene.background = new THREE.CubeTextureLoader().load(urls);


    let tube = new THREE.CylinderGeometry(1, 1, 10, 50, 25, true);
    let sphere =  new THREE.SphereGeometry(1, 50, 25, 0, Math.PI * 2, Math.PI / 2, Math.PI)
    tube.translate(0, 0.5, 0)
    sphere.translate(0, -4.5, 0)
    let merged = BufferGeometryUtils.mergeGeometries([tube, sphere])


    let tubeMesh =  new THREE.Mesh(merged);
    tubeMesh.material = new THREE.MeshPhysicalMaterial(
        {
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

    //deb.vertices += merged.attributes.position.count

    //tubeMesh.scale.setScalar(0.75)
    //H<sub>2</sub>SO<sub>4</sub>
    tubeMesh.renderOrder = 3
    tuber = new LiquidHolder(tubeMesh, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.3, color: 0xfffd80}), 0, 12, 0.8, 0.85)
    interactableObjects.push(tuber.holderMesh)
    holders.push(tuber)
    // let tuber2 = new LiquidHolder(tubeMesh, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.7, color: 0xff0000}), 0.5, 10, 0.8, 0.85)
    // interactableObjects.push(tuber.holderMesh)
    // interactableObjects.push(tuber2.holderMesh)
    // holders.push(tuber2)

    tuber.rest(new THREE.Vector3().copy(holder1.position).sub(new THREE.Vector3(
        holderSize.x / 2 - holderCenter.x / 2 - holderSize.x * 0.2 * 1, 
        holderSize.y / 2 - holderCenter.y / 2 - holderSize.y * 0.18, 
        holderSize.z / 2 - holderCenter.z / 2 - holderSize.z * 0.35
    )))
    // tuber.updateFill(0.47, tio);
    // tuber.updateFill(0.47, acid);
    for (let i = 2; i <= 4; i++)
    {
        let t = new LiquidHolder(tubeMesh, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.3, color: 0xfffd80}), 0, 12, 0.8, 0.85)
        holders.push(t);
        interactableObjects.push(t.holderMesh);
        t.rest(new THREE.Vector3().copy(holder1.position).sub(new THREE.Vector3(
            holderSize.x / 2 - holderCenter.x / 2 - holderSize.x * 0.2 * i, 
            holderSize.y / 2 - holderCenter.y / 2 - holderSize.y * 0.18, 
            holderSize.z / 2 - holderCenter.z / 2 - holderSize.z * 0.35
        )))
    }

    // holders[1].updateFill(0.4, tio)
    // holders[1].updateFill(0.07, water)
    // holders[1].updateFill(0.47, acid)


    // holders[2].updateFill(0.3, tio)
    // holders[2].updateFill(0.17, water)
    // holders[2].updateFill(0.47, acid)

    // holders[3].updateFill(0.2, tio)
    // holders[3].updateFill(0.17, water)
    // holders[3].updateFill(0.47, acid)

    for (let i = 1; i <= 4; i++)
    {
        let t = new LiquidHolder(tubeMesh, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.3, color: 0xfffd80}), 0, 12, 0.8, 0.85)
        holders.push(t);
        interactableObjects.push(t.holderMesh);
        t.rest(new THREE.Vector3().copy(holder2.position).sub(new THREE.Vector3(
            holderSize.x / 2 - holderCenter.x / 2 - holderSize.x * 0.2 * i, 
            holderSize.y / 2 - holderCenter.y / 2 - holderSize.y * 0.18, 
            holderSize.z / 2 - holderCenter.z / 2 - holderSize.z * 0.35
        )))
    }

    let beakerModel = await getMesh("./assets/glasses/beaker.gltf")

    let beakerSize = new THREE.Vector3;
    let beakerCenter = new THREE.Vector3;
    let beakerBox = new THREE.Box3().setFromObject(beakerModel);
    beakerBox.getSize(beakerSize);
    beakerBox.getCenter(beakerCenter);

    let holderWater = new LiquidHolder(beakerModel, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.6, color: 0x07cce6}), 0.7, 620, 0.8, 0.95, "H<sub>2</sub>O");
    let holderAcid = new LiquidHolder(beakerModel, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.6, color:  0xdfe607}), 0.7, 620, 0.8, 0.95, "H<sub>2</sub>SO<sub>4</sub>");
    let holderNa = new LiquidHolder(beakerModel, new THREE.MeshLambertMaterial({transparent: true, opacity: 0.7, color:  0xcdcfa9}), 0.7, 620, 0.8, 0.95, "Na<sub>2</sub>S<sub>2</sub>O<sub>3</sub>");

    holders.push(holderWater, holderAcid, holderNa);
    interactableObjects.push(holderWater.holderMesh, holderAcid.holderMesh, holderNa.holderMesh)

    let q = new THREE.Quaternion().setFromEuler(new THREE.Euler( 0, -toRadians(180), 0))

    holderWater.rest(new THREE.Vector3(table.position.x + tableSize.x / 2 * 0.6, table.position.y + tableSize.y / 2 * 0.2 + beakerSize.y / 2, table.position.z - tableSize.z / 2 * 0.6))

    
    holderAcid.rest(new THREE.Vector3(table.position.x + tableSize.x / 2 * 0.75, table.position.y + tableSize.y / 2 * 0.2 + beakerSize.y / 2, table.position.z - tableSize.z / 2 * 0.6))

    holderNa.rest(new THREE.Vector3(table.position.x + tableSize.x / 2 * 0.9, table.position.y + tableSize.y / 2 * 0.2 + beakerSize.y / 2, table.position.z - tableSize.z / 2 * 0.6))

    holderWater.restQuaternion(q)
    holderAcid.restQuaternion(q)
    holderNa.restQuaternion(q)


    // cam.position.z = tuber.holderMesh.position.z;
    // cam.position.x = tuber.holderMesh.position.x;
    // cam.position.y = tuber.holderMesh.position.y + 20;
    cam.position.copy(new THREE.Vector3(holder2.position.x, 60, 25))
    controls.target = new THREE.Vector3().copy(holder2.position).add(new THREE.Vector3(0, holderSize.y *0.2, 0))
    //computeChart();
    //controls.target = new THREE.Vector3().copy(holderWater.holderMesh.position)

//scene.add(tubeMesh)


    // console.log(table);
    // table.material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide})
    // table.position.copy(new THREE.Vector3(0, 0, 0))
    // console.log(scene.children);
    // let box = new THREE.BoxHelper(table);
    // //table.scale.copy(new THREE.Vector3(1000, 1000, 1000))
    // table.scale.setScalar(1000)
    // scene.add(table)
    // scene.add(box)

    //loaded = true;

    render();
    
}

setup();

