export class RobotWebSocket {
    constructor(ip = '192.168.43.1', port = 8080) {
        this.ip = ip;
        this.port = port;
        this.ws = null;
        this.reconnectInterval = 2000;
        this.shouldReconnect = false;

        // Event handlers
        this.onOpen = null;
        this.onClose = null;
        this.onError = null;
        this.onMessage = null;
    }

    connect() {
        this.shouldReconnect = true;
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        try {
            this.ws = new WebSocket(`ws://${this.ip}:${this.port}/`);

            this.ws.onopen = () => {
                console.log('Connected to Robot WebSocket');
                if (this.onOpen) this.onOpen();
            };

            this.ws.onclose = () => {
                console.log('Disconnected from Robot WebSocket');
                if (this.onClose) this.onClose();
                if (this.shouldReconnect) {
                    setTimeout(() => this.connect(), this.reconnectInterval);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
                if (this.onError) this.onError(error);
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (this.onMessage) this.onMessage(data);
                } catch (e) {
                    console.error('Error parsing message:', e);
                }
            };
        } catch (e) {
            console.error('Connection failed:', e);
            if (this.shouldReconnect) {
                setTimeout(() => this.connect(), this.reconnectInterval);
            }
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    send(payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log(`WebSocket sending: ${JSON.stringify(payload)}`);
            this.ws.send(JSON.stringify(payload));
        } else {
            console.log(`WebSocket not open, readyState: ${this.ws ? this.ws.readyState : 'no ws'}`);
        }
    }

    sendInit(opModeName) {
        console.log(`WebSocket sendInit called with opModeName: ${opModeName}`);
        this.send({ type: 'INIT_OP_MODE', opModeName });
    }

    sendStart() {
        this.send({ type: 'START_OP_MODE' });
    }

    sendStop() {
        this.send({ type: 'STOP_OP_MODE' });
    }

    requestStatus() {
        this.send({ type: 'GET_ROBOT_STATUS' });
    }
}
