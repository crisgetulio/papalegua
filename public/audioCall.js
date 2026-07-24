class AudioCall {
    constructor(socket, myId, targetId, targetName, isVideo = false) {
        this.socket = socket;
        this.myId = myId;
        this.targetId = targetId;
        this.targetName = targetName;
        this.isVideo = isVideo;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isCaller = false;
        this.isActive = false;
        this.onCallEnded = null;
        this.onRemoteStream = null;
        this.onCallAccepted = null;
    }

    startCall() {
        this.isCaller = true;
        this.initPeerConnection();
        const constraints = { audio: true, video: this.isVideo };
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                this.localStream = stream;
                stream.getTracks().forEach(track => this.peerConnection.addTrack(track, stream));
                return this.peerConnection.createOffer();
            })
            .then(offer => this.peerConnection.setLocalDescription(offer))
            .then(() => {
                this.socket.emit('call user', {
                    toUserId: this.targetId,
                    fromUserId: this.myId,
                    offer: this.peerConnection.localDescription,
                    isVideo: this.isVideo
                });
            })
            .catch(err => console.error('Erro ao iniciar chamada:', err));
    }

    acceptCall(offer) {
        this.isCaller = false;
        this.initPeerConnection();
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const constraints = { audio: true, video: this.isVideo };
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                this.localStream = stream;
                stream.getTracks().forEach(track => this.peerConnection.addTrack(track, stream));
                return this.peerConnection.createAnswer();
            })
            .then(answer => this.peerConnection.setLocalDescription(answer))
            .then(() => {
                this.socket.emit('accept call', {
                    toUserId: this.targetId,
                    fromUserId: this.myId,
                    answer: this.peerConnection.localDescription
                });
                if (this.onCallAccepted) this.onCallAccepted();
            })
            .catch(err => console.error('Erro ao aceitar chamada:', err));
    }

    initPeerConnection() {
        const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        this.peerConnection = new RTCPeerConnection(config);
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            if (this.onRemoteStream) this.onRemoteStream(this.remoteStream);
        };
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice candidate', {
                    toUserId: this.targetId,
                    candidate: event.candidate
                });
            }
        };
        this.isActive = true;
    }

    handleRemoteAnswer(answer) {
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    handleRemoteCandidate(candidate) {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    endCall() {
        if (this.peerConnection) this.peerConnection.close();
        if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
        if (this.remoteStream) this.remoteStream.getTracks().forEach(t => t.stop());
        this.isActive = false;
        this.socket.emit('end call', {
            toUserId: this.targetId,
            fromUserId: this.myId
        });
        if (this.onCallEnded) this.onCallEnded();
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return !audioTrack.enabled;
            }
        }
        return false;
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                return videoTrack.enabled;
            }
        }
        return false;
    }
}
