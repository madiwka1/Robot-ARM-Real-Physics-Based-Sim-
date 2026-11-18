import type {
  BridgeConnectionState,
  JointTuple,
  RobotBridgeTelemetry,
  RobotHardwareBridge,
} from './types';

/**
 * Modular WebSocket / ROS 2 (rosbridge_suite compatible) hardware adapter.
 * Allows seamless handoff from simulated kinematics to physical robot controllers
 * over WebSocket without coupling UI or kinematic modules to transport details.
 */
export class WebSocketRobotBridge implements RobotHardwareBridge {
  public readonly protocol: 'ros2-rosbridge' | 'websocket-json';
  private _state: BridgeConnectionState = 'disconnected';
  private socket: WebSocket | null = null;
  private listeners = new Set<(telemetry: RobotBridgeTelemetry) => void>();

  constructor(protocol: 'ros2-rosbridge' | 'websocket-json' = 'ros2-rosbridge') {
    this.protocol = protocol;
  }

  get state(): BridgeConnectionState {
    return this._state;
  }

  async connect(endpointUrl: string): Promise<void> {
    this.disconnect();
    this._state = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(endpointUrl);
        this.socket = ws;

        ws.onopen = () => {
          this._state = 'connected';
          if (this.protocol === 'ros2-rosbridge') {
            ws.send(
              JSON.stringify({
                op: 'subscribe',
                topic: '/joint_states',
                type: 'sensor_msgs/msg/JointState',
              }),
            );
          }
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data));
            const joints = Array.isArray(payload?.msg?.position)
              ? payload.msg.position
              : Array.isArray(payload?.jointAnglesDeg)
                ? payload.jointAnglesDeg
                : null;
            if (joints && joints.length >= 6) {
              const tuple: JointTuple = [
                Number(joints[0]),
                Number(joints[1]),
                Number(joints[2]),
                Number(joints[3]),
                Number(joints[4]),
                Number(joints[5]),
              ];
              this.listeners.forEach((cb) =>
                cb({
                  jointAnglesDeg: tuple,
                  gripperWidthMm:
                    typeof payload.gripperWidthMm === 'number'
                      ? payload.gripperWidthMm
                      : undefined,
                  timestampMs: Date.now(),
                }),
              );
            }
          } catch {
            // Ignore malformed telemetry frames
          }
        };

        ws.onerror = () => {
          this._state = 'error';
          reject(new Error(`Unable to connect to ${endpointUrl}`));
        };

        ws.onclose = () => {
          if (this._state !== 'error') {
            this._state = 'disconnected';
          }
          this.socket = null;
        };
      } catch (err) {
        this._state = 'error';
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this._state = 'disconnected';
  }

  sendJointCommand(anglesDeg: JointTuple): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.protocol === 'ros2-rosbridge') {
      this.socket.send(
        JSON.stringify({
          op: 'publish',
          topic: '/joint_group_position_controller/commands',
          msg: {
            data: anglesDeg.map((d) => (d * Math.PI) / 180),
          },
        }),
      );
    } else {
      this.socket.send(
        JSON.stringify({
          type: 'joint_command',
          anglesDeg,
          timestampMs: Date.now(),
        }),
      );
    }
  }

  sendGripperCommand(widthMm: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.protocol === 'ros2-rosbridge') {
      this.socket.send(
        JSON.stringify({
          op: 'publish',
          topic: '/gripper_controller/command',
          msg: {
            width_meters: widthMm / 1000,
          },
        }),
      );
    } else {
      this.socket.send(
        JSON.stringify({
          type: 'gripper_command',
          widthMm,
          timestampMs: Date.now(),
        }),
      );
    }
  }

  onTelemetry(listener: (telemetry: RobotBridgeTelemetry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
