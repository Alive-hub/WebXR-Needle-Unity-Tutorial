import {GLTF, GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader";
import {
    AssetReference,
    Behaviour,
    Collision,
    delay,
    GameObject,
    NeedleEngine,
    serializeable,
    Text,
    Time
} from "@needle-tools/engine";
import {Mesh, MeshBasicMaterial, Object3D, Scene, SphereGeometry, Vector3, Points, PointsMaterial, BufferGeometry, Float32BufferAttribute, Color, AdditiveBlending} from "three";
import {Pathfinding} from "three-pathfinding";
import { Transform } from "@needle-tools/engine/lib/engine-schemes/transform";
import { vec3 } from "three/src/nodes/TSL";

export class AiEnemyBehaviour extends Behaviour {

    //Nav Mesh
    @serializeable(AssetReference)
    navMesh!:AssetReference;

    @serializeable(AssetReference)
    onDeathEffect!: AssetReference;

    private instantedPlusOne!:Object3D;

    pathfinder!: Pathfinding;
    private zoneID: string = "level1";
    private navZone: any;

    private path: Vector3[] = [];
    private targetPosition: Vector3 = new Vector3();
    private initialPosition: Vector3 = new Vector3();

    private currentWayPointIndex: number = 0;
    movementSpeed: number = .5;
    targetThreshold: number = 0.5;
    
    // Track whether the enemy is active or disabled (after being shot)
    private isActive: boolean = true;

    private deathEffect: Object3D | null = null;

    async onEnable() {

        if(!this.navMesh) {
            console.error("NavMesh not assigned");
            return;
        }

        // Store initial position for respawning
        this.initialPosition.copy(this.gameObject.position);

        // Load and set up nav mesh
        const navMeshObject = await this.navMesh.loadAssetAsync();
        if (!navMeshObject) {
            console.error("Failed to load NavMesh asset!");
            return;
        }

        // Extract geometry from nav mesh
        let meshGeometry;
        if(navMeshObject instanceof Mesh) {
            meshGeometry = navMeshObject.geometry;
        } else if (navMeshObject.children.length > 0 && navMeshObject.children[0] instanceof Mesh) {
            meshGeometry = (navMeshObject.children[0] as Mesh).geometry;
        } else {
            console.log("NavMeshObject does not contain valid geometry!");
            return;
        }

        // Set up pathfinding
        this.navZone = Pathfinding.createZone(meshGeometry);
        this.pathfinder = new Pathfinding();
        this.zoneID = "level1";
        this.pathfinder.setZoneData(this.zoneID, this.navZone);
        console.log("Nav mesh initialized with", this.navZone.vertices.length, "vertices");

        // Ensure the enemy starts on the nav mesh
        this.snapToNavMesh();
        this.pickNewTarget();
    }

    // Snap position to navmesh
    private snapToNavMesh() {
        if (!this.pathfinder) return;
        
        const group = this.pathfinder.getGroup(this.zoneID, this.gameObject.position) || 0;
        const closestNode = this.pathfinder.getClosestNode(this.gameObject.position, this.zoneID, group);
        if (closestNode) {
            this.gameObject.position.copy(closestNode.centroid);
        }
    }

    wasHitByBullet: boolean = false;

    onCollisionEnter(col: Collision): any {
        if (!this.isActive || col.collider.layer !== 3 || this.wasHitByBullet) return;
        
        console.log("Collided with bullet!");
        
        this.wasHitByBullet = true;
        
        // Directly hide all mesh renderers and disable colliders
        this.hideAllMeshesAndColliders(this.gameObject);
        
        // Track that the enemy is inactive for game logic
        this.isActive = false;
        
        // Reset path
        this.path = [];

        // Use Unity particle system from the AssetReference
        GameObject.instantiate(this.onDeathEffect).then(obj => {
            if (obj) {
                // Position the effect at the enemy's current position plus an offset
                const spawnPosition = this.gameObject.position.clone().add(new Vector3(0, 1, 0));
                obj.position.copy(spawnPosition);
                // Store reference for cleanup
                this.deathEffect = obj;
            }
        });
        
        // Respawn after delay
        setTimeout(() => this.respawn(), 3000);
    }
    
    // Helper to hide all meshes and disable colliders
    private hideAllMeshesAndColliders(object: Object3D): void {
        // Recursively process all children
        object.traverse((child: Object3D) => {
            // Hide all mesh renderers
            if (child instanceof Mesh) {
                child.visible = false;
            }
            
            // Disable any colliders (if they have a userData.isCollider property)
            if (child.userData && child.userData.isCollider) {
                child.userData.enabled = false;
            }
        });
        
        // Also disable the entire object's visibility as a fallback
        object.visible = false;
    }
    
    // Helper to show all meshes and enable colliders
    private showAllMeshesAndColliders(object: Object3D): void {
        // Recursively process all children
        object.traverse((child: Object3D) => {
            // Show all mesh renderers
            if (child instanceof Mesh) {
                child.visible = true;
            }
            
            // Enable any colliders
            if (child.userData && child.userData.isCollider) {
                child.userData.enabled = true;
            }
        });
        
        // Make the entire object visible again
        object.visible = true;
    }
    
    // Respawn at original position
    private respawn() {
        if (!this.pathfinder) return;
        
        // Move back to initial position
        this.gameObject.position.copy(this.initialPosition);
        
        // Ensure position is on navmesh
        this.snapToNavMesh();
        
        // Show enemy and reactivate by showing all meshes
        this.showAllMeshesAndColliders(this.gameObject);
        this.wasHitByBullet = false;
        this.isActive = true;

        // Ensure death effect is cleaned up
        if (this.deathEffect) {
            this.context.scene.remove(this.deathEffect);
            this.deathEffect = null;
        }
        
        // Find new target
        setTimeout(() => {
            if (this.pathfinder) this.pickNewTarget();
        }, 100);
    }

    update() {
        // Skip updates when disabled
        if (!this.pathfinder || this.wasHitByBullet || !this.isActive) return;

        if (this.path?.length > 0) {
            // Get the current waypoint we're moving toward
            const waypoint = this.path[this.currentWayPointIndex];
            const direction = new Vector3().subVectors(waypoint, this.gameObject.position);
            const distance = direction.length();

            // Move towards waypoint
            if (distance > this.targetThreshold) {
                // Calculate movement
                direction.normalize();
                const smoothSpeed = Math.min(this.movementSpeed, distance / 0.5);
                const displacement = direction.clone().multiplyScalar(smoothSpeed * this.context.time.deltaTime);

                // Update position if valid
                const newPosition = this.gameObject.position.clone().add(displacement);
                const newGroup = this.pathfinder.getGroup(this.zoneID, newPosition);
                if (newGroup !== undefined && newGroup !== null) {
                    this.gameObject.position.copy(newPosition);
                    
                    // Force a clean look direction at the current waypoint each frame
                    // This ensures we're always facing the right waypoint
                    const lookTarget = new Vector3(
                        waypoint.x,
                        this.gameObject.position.y, // Keep y position the same to avoid tilting
                        waypoint.z
                    );
                    this.gameObject.lookAt(lookTarget);
                }

            } else {
                // Reached waypoint, move to next
                this.currentWayPointIndex++;
                console.log(`Moving to waypoint ${this.currentWayPointIndex + 1}/${this.path.length}`);
                
                if (this.currentWayPointIndex >= this.path.length) {
                    console.log("Path completed, finding new target");
                    this.pickNewTarget();
                } else {
                    // Look at next waypoint immediately when reaching current one
                    const nextWaypoint = this.path[this.currentWayPointIndex];
                    const lookTarget = new Vector3(
                        nextWaypoint.x,
                        this.gameObject.position.y,
                        nextWaypoint.z
                    );
                    this.gameObject.lookAt(lookTarget);
                }
            }
        } else {
            this.pickNewTarget();
        }
    }

    pickNewTarget() {
        if (!this.pathfinder || !this.navZone) return;
        
        try {
            // Get current nav group
            let group = this.pathfinder.getGroup(this.zoneID, this.gameObject.position);
            if (group === undefined || group === null) {
                this.snapToNavMesh();
                group = this.pathfinder.getGroup(this.zoneID, this.gameObject.position) || 0;
                if (group === undefined || group === null) return;
            }

            // Try to find a valid path
            let attempts = 0;
            const MAX_ATTEMPTS = 20;
            const minDistance = 3;
            const maxDistance = 8;

            while (attempts < MAX_ATTEMPTS) {
                // Get random point from nav mesh
                if (!this.navZone.vertices || this.navZone.vertices.length === 0) break;
                const randomIndex = Math.floor(Math.random() * this.navZone.vertices.length);
                const randomPoint = this.navZone.vertices[randomIndex];
                
                // Check distance
                const distance = randomPoint.distanceTo(this.gameObject.position);
                if (distance < minDistance || distance > maxDistance) {
                    attempts++;
                    continue;
                }

                // Get closest nav node to random point
                const targetGroup = this.pathfinder.getGroup(this.zoneID, randomPoint) || 0;
                const targetNode = this.pathfinder.getClosestNode(randomPoint, this.zoneID, targetGroup);
                if (!targetNode) {
                    attempts++;
                    continue;
                }
                
                // Set target and find path
                this.targetPosition.copy(targetNode.centroid);
                // this.createGoalIndicator(this.targetPosition);
                
                this.path = this.pathfinder.findPath(
                    this.gameObject.position.clone(),
                    this.targetPosition,
                    this.zoneID,
                    group
                ) || [];

                // Check if path is valid
                if (this.path.length > 0) {
                    this.currentWayPointIndex = 0;
                    // this.visualizePath();
                    return;
                }
                
                attempts++;
            }
            
            // If we get here, no valid path was found
            this.path = [];
            console.warn("Could not find valid path after", MAX_ATTEMPTS, "attempts");
            this.respawn();
            
        } catch (error) {
            console.error("Error in pickNewTarget:", error);
            this.path = [];
        }
    }

    // Visualize the path with indicators
    private visualizePath() {
        // for (const point of this.path) {
        //     this.createGoalIndicator(point);
        // }
    }

    createGoalIndicator(point: Vector3): void {
        const geometry = new SphereGeometry(0.5, 16, 16);
        const material = new MeshBasicMaterial({ color: 0x00ff00 });
        const sphere = new Mesh(geometry, material);
        sphere.position.copy(point);
        this.context.scene.add(sphere);

        setTimeout(() => {
            this.context.scene.remove(sphere);
        }, 10000);
    }
}