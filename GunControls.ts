import {
    AssetReference,
    Behaviour, GameObject,
    InstantiateOptions,
    Rigidbody,
    serializeable,
    showDebugConsole
} from "@needle-tools/engine";
import {log} from "three/src/nodes/math/MathNode";
import {Object3D, Vector3} from "three";
import { DeviceUtilities } from "@needle-tools/engine";
import {Transform} from "@needle-tools/engine/lib/engine-schemes/transform";

export class GunControls extends Behaviour{

    @serializeable(AssetReference)
    bulletPrefab!: AssetReference;

    bulletForce: number = .0025;

    start() {
    }

    async shootBullet() {

        if (!this.bulletPrefab) return;

        const spawnPos = this.gameObject.worldPosition;

        let forward = new Vector3();
        forward = this.gameObject.worldForward.multiplyScalar(.3);

        const options = new InstantiateOptions();
        options.position = spawnPos;

        const bullet = await this.bulletPrefab.instantiate(options);

        if (bullet) {
            bullet.lookAt(spawnPos.add(forward));

            // Retrieve the bullet's Rigidbody component
            const rb = bullet.getComponent(Rigidbody);

            if (rb) {
                rb.applyImpulse(forward.clone().multiplyScalar(this.bulletForce), true);
                console.log(`ShootingBullet with force ${this.bulletForce}!`);
                await this.DestroyBulletAfterDelay(bullet, 2);

            }
        }
    }

    async DestroyBulletAfterDelay(bulletObj: Object3D, seconds:number) {
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        bulletObj.destroy();
    }
}