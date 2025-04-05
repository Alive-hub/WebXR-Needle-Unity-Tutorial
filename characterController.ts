import { Behaviour, DeviceUtilities, Rigidbody, serializable, WebXR } from "@needle-tools/engine";
import { Object3D, Vector2, Vector3 } from "three";
import nipplejs from "nipplejs";
import { GunControls } from "./GunControls";

export class characterController extends Behaviour{

    isMobile:boolean = false;
    isDesktop:boolean = false;
    isXR:boolean = false;

    private keysPressed: { [key: string]: boolean } = {};
    private movementSpeed: number = 5; 
    private jumpForce: number = 1;

    private isGrounded: boolean = true; 
    private spawnPosition: Vector3 = new Vector3();
    private mobileMoveDir: Vector3 = new Vector3();

    @serializable(Rigidbody)
    rb!:Rigidbody;

    @serializable(WebXR)
    webXR!: WebXR;
    coolDown:boolean = false;

    @serializable(GunControls)
    gunControlsRef!:GunControls;

    onEnable(): void {
        this.spawnPosition.copy(this.gameObject.position);

        this.checkForDeviceType().then(() => {
            if(this.isMobile){
                this.setupMobileControls();
            } else if (this.isDesktop){
                this.setupDesktopControls();
            } else if (this.isXR){
                //
            }
        })
    }

    handleRightThumbstickMovement(): void {
        const rightController = (this.webXR as any)?.session?.rightController;
        const axes = rightController?.gamepad?.axes;
        if (axes && axes.length >= 4) {
            const x = axes[2];
            const y = axes[3];
            const moveDir = new Vector3(-x, 0, -y);
            if (moveDir.lengthSq() > 0) {
                moveDir.normalize();
                const displacement = moveDir.clone().multiplyScalar(this.movementSpeed * this.context.time.deltaTime);
                this.gameObject.position.add(displacement);
                const targetPos = this.gameObject.position.clone().add(moveDir);
                const dummy = new Object3D();
                dummy.position.copy(this.gameObject.position);
                dummy.lookAt(targetPos);
                const desiredQuat = dummy.quaternion;
                const angleDiff = this.gameObject.quaternion.angleTo(desiredQuat);
                if (angleDiff < 0.01) {
                    this.gameObject.quaternion.copy(desiredQuat);
                } else {
                    this.gameObject.quaternion.slerp(desiredQuat, 0.35);
                }
            }
        }
    }

    handleXRJump(): void {
        const rightController = (this.webXR as any)?.session?.rightController;
        const bButton = rightController?.getButton && rightController.getButton("b-button");
        if (bButton && bButton.pressed) {
            console.log("jump!");
            this.jump();
        }
    }

    handleXRShoot(): void {
        const rightController = (this.webXR as any)?.session?.rightController;
        const triggerButton = rightController?.gamepad?.buttons[0].pressed;
        if (!triggerButton || this.coolDown) return;
        this.triggerShootingFromPosition();
        this.coolDown = true;
        setTimeout(() => {
            this.coolDown = false;
        }, 100);
    }

    setupDesktopControls(){
        document.addEventListener("keydown" , this.onKeyDown.bind(this));
        document.addEventListener("keyup", this.onKeyUp.bind(this));
    }


    onKeyDown(event: KeyboardEvent){
        const key = event.key.toLowerCase();

        this.keysPressed[key] = true;

        if(key === " "){
            this.jump();
        }

        if(key === "k"){
            this.triggerShootingFromPosition();
        }
    }

    onKeyUp(event: KeyboardEvent){
        this.keysPressed[event.key.toLocaleLowerCase()] = false;
    }

    async checkForDeviceType(){
        const xrSupported = await this.isXRDevice();

        if(xrSupported){
            this.isXR = true;
        } else {
            this.isMobile = DeviceUtilities.isMobileDevice();

            if(!this.isMobile){
                this.isDesktop = DeviceUtilities.isDesktop();
            }
        }
    }

    async isXRDevice(): Promise<boolean>{
        if(navigator.xr){
            try{
                return await navigator.xr.isSessionSupported("immersive-vr");
            } catch(error){
                console.error("XR check error!");
                return false; 
            }
        }
        return false; 
    }

    setupMobileControls(){
        this.createMobileJoystick();
        this.createMobileButtons();
    }

    createMobileJoystick(){
        const joystickZone = document.createElement("div");
        joystickZone.id = "joystickZone";
        joystickZone.style.cssText = `
        position: absolute;
        bottom: 20px; 
        left: 20px;
        width: 150px;
        height: 150px;
        z-index: 100;
        `;

        document.body.appendChild(joystickZone);


        const manager = nipplejs.create({
            zone: joystickZone,
            mode:"static",
            position: { left: "75px", top: "75px" },
            color: "white"
        });
        
        manager.on("move", (_evt: any, data: any) => {
            this.mobileMoveDir.set(data.vector.x, 0, -data.vector.y);
        });

        manager.on("end", () => {
            this.mobileMoveDir.set(0,0,0);
        })

    }

    applyDesktopControls(){
        const moveDir = new Vector3();


        if(this.keysPressed["w"]){
            moveDir.z += 1;
        } 

        if(this.keysPressed["s"]){
            moveDir.z -= 1;
        }

        if(this.keysPressed["a"]){
            moveDir.x += 1;
        }

        if(this.keysPressed["d"]){
            moveDir.x -= 1; 
        }


        if(moveDir.lengthSq() > 0){
            moveDir.normalize();


            const displacement = moveDir.clone().multiplyScalar(this.movementSpeed * this.context.time.deltaTime);
            this.gameObject.position.add(displacement);

            const targetPos = this.gameObject.position.clone().add(moveDir);

            const dummy = new Object3D();
            dummy.position.copy(this.gameObject.position);
            dummy.lookAt(targetPos);

            const desiredQuaternion = dummy.quaternion;


            const angleDiff = this.gameObject.quaternion.angleTo(desiredQuaternion);

            if(angleDiff < 0.01){
                this.gameObject.quaternion.copy(desiredQuaternion);
            } else {
                this.gameObject.quaternion.slerp(desiredQuaternion, 0.35);
            }
        }
    }


    update(): void {

        //check if player fell 
        this.checkForPlayerFellDown();

        if(this.isDesktop){
            this.applyDesktopControls();
        }

        if(this.isMobile){
            const moveDir = new Vector3(-this.mobileMoveDir.clone().x, this.mobileMoveDir.clone().y, -this.mobileMoveDir.clone().z);
            
            if(moveDir.lengthSq() > 0){
                moveDir.normalize();

                const displacement = moveDir.clone().multiplyScalar(this.movementSpeed * this.context.time.deltaTime);
                this.gameObject.position.add(new Vector3(displacement.x, -displacement.y, displacement.z));

                const targetPos = this.gameObject.position.clone().add(moveDir);

                const dummy = new Object3D();
                dummy.position.copy(this.gameObject.position);
                dummy.lookAt(targetPos);

                const desiredQuaternion = dummy.quaternion;


                const angleDiff = this.gameObject.quaternion.angleTo(desiredQuaternion);

                if(angleDiff < 0.01){
                    this.gameObject.quaternion.copy(desiredQuaternion);
                } else {
                    this.gameObject.quaternion.slerp(desiredQuaternion, 0.35);
                }
            }
        }

        if (this.context.isInVR || this.context.isInAR) {
            this.handleRightThumbstickMovement();
            this.handleXRJump();
            this.handleXRShoot();
        }
    }

    checkForPlayerFellDown(){
        if(this.gameObject.position.distanceTo(this.spawnPosition) > 30){
            this.gameObject.position.copy(this.spawnPosition);
            this.rb?.setVelocity(new Vector3(0,0,0));
            this.rb?.setAngularVelocity(new Vector3(0,0,0));
        }
    }

    createMobileButtons(){

        const buttonContainer = document.createElement("div");
        buttonContainer.id = "mobileButtonContainer";

        buttonContainer.style.cssText = `
        position: absolute;
        bottom: 20px;
        right: 20px; 
        display: flex;
        flexdirection: column;
        gap: 10px;
        z-index: 100;
        `;


        const shootButton = document.createElement("button");
        shootButton.id = "shootButton";
        shootButton.style.cssText = `
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background-color: orange; 
        border: none; 
        color: white;
        font-size: 16px;
        font-weight: bold; 
        cursor: pointer;
        `

        shootButton.textContent = "shoot";
        shootButton.onclick = () => {
            this.triggerShootingFromPosition();
        }


        const jumpButton = document.createElement("button");
        jumpButton.id = "jumpButton";
        jumpButton.style.cssText = `
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background-color: blue; 
        border: none; 
        color: white;
        font-size: 16px;
        font-weight: bold; 
        cursor: pointer;
        `;
        
        jumpButton.textContent = "jump";
        jumpButton.onclick = () => {
            this.jump();
        }

        buttonContainer.appendChild(shootButton);
        buttonContainer.appendChild(jumpButton);
        document.body.appendChild(buttonContainer);
    }

    jump(){
        if(!this.isGrounded) return;

        this.rb?.applyImpulse(new Vector3(0, this.jumpForce, 0), true);
        this.isGrounded = false;

        setTimeout(() => {this.isGrounded = true}, 800);
    }

    triggerShootingFromPosition(){
        this.gunControlsRef.shootBullet();
    }




}