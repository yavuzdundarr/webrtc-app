import React, { useEffect, useRef, useState } from "react";
import "../css/AudioChat.css"

const AudioChat = ({ socket }) => {
    const [peerConnection, setPeerConnection] = useState(null);
    const [isCalling, setIsCalling] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedURL, setRecordedURL] = useState(null);
    const [isAccepted, setIsAccepted] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [isDataOffered, setIsDataOffered] = useState(null);
    const [isMuted, setIsMuted] = useState(false);

    const remoteAudio = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const localStreamRef = useRef(null);

    // WebSocket ile gelen mesajları dinleyip işleme (offer, answer, ice-candidate)
    useEffect(() => {
        const handleSignalingData = async (message) => {
            let data;
            if (message.data instanceof Blob) {
                data = await message.data.text().then(JSON.parse);
            } else {
                data = JSON.parse(message.data);
            }

            if (data.type === "call-rejected") {
                alert(data.message);
                setIsCalling(false);
                setIsDataOffered(null);
                setPeerConnection(null)
            }

            if(data.type === "call-ended"){
                setIsCalling(false);
                setIsDataOffered(null);
                if (peerConnection) {
                    peerConnection.close();
                    setPeerConnection(false)
                }
                if (remoteAudio.current) {
                    remoteAudio.current.srcObject.getTracks().forEach((track => track.stop()))
                    remoteAudio.current.srcObject = null;
                    console.log("Bağlantı bitirildi.");
                }
                if (localStreamRef.current) {
                    localStreamRef.current.getTracks().forEach(track => track.stop());
                    localStreamRef.current = null;
                    console.log("Bağlantı bitirildi.");
                }
            }
            if (data.type === "offer") {
                setIsIncomingCall(true)
                setIsDataOffered(data.offer)
                console.log("Gelen teklif (offer) alındı.");
            } else if (data.type === "answer") {
                console.log("Yanıt (answer) alındı.");
                if (peerConnection) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
            } else if (data.type === "ice-candidate") {
                console.log("ICE Adayı alındı.");
                if (peerConnection) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        };

        socket.addEventListener("message", handleSignalingData);
        return () => socket.removeEventListener("message", handleSignalingData);
    }, [socket, peerConnection]);

    // PeerConnection olşturma fonksiyonu
    const createPeerConnection = async (initiator) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate }));
            }
        };

        pc.ontrack = (event) => {
            console.log("Karşı tarafın sesi alındı.");
            remoteAudio.current.srcObject = event.streams[0];
            if (isRecording) {
                startRecordingRemoteStream(event.streams[0]);
            }
        };

        if (initiator) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStreamRef.current = stream;
                stream.getTracks().forEach((track) => pc.addTrack(track, stream));
            } catch (err) {
                console.error("Mikrofon erişim hatası:", err);
                return null;
            }
        }

        setPeerConnection(pc);
        return pc;
    };

    // Görüşmeyi başlat
    const startCall = async () => {
        if (isCalling) return;
        setIsCalling(true);

        const pc = await createPeerConnection(true);
        if (!pc) {
            console.error("PeerConnection oluşturulamadı!");
            return;
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: "offer", offer }));
    };

    // Sesi kaydetme fonksiyonları
    const startRecordingRemoteStream = (remoteStream) => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            recordedChunksRef.current = [];
        }

        const recorder = new MediaRecorder(remoteStream, { mimeType: "audio/webm" });
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunksRef.current.push(e.data);
            }
        };
        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
            const url = URL.createObjectURL(blob);
            setRecordedURL(url);
            console.log("Kayıt tamamlandı, URL:", url);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        console.log("Kayıt başladı (MediaRecorder)...");
    };

    const handleStartRecording = () => {
        if (!remoteAudio.current.srcObject) {
            alert("Henüz bir remote ses yok, karşı taraf bağlansın veya konuşsun!");
            return;
        }
        setIsRecording(true);
        startRecordingRemoteStream(remoteAudio.current.srcObject);
    };

    const handleStopRecording = () => {
        setIsRecording(false);
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
            console.log("Kayıt durduruldu.");
        }
    };

    // Mute/Unmute butonu için fonksiyon
    const toggleMute = () => {
        if (!localStreamRef.current) return;
        localStreamRef.current.getAudioTracks().forEach((track) => {
            track.enabled = !track.enabled;
        });
        setIsMuted((prev) => !prev);
    };

    // Görüşme onaylama butonu
    const acceptCall = async (isAccepted) => {
        setIsAccepted(isAccepted)
        if(isAccepted){
            const pc = await createPeerConnection(false);
            await pc.setRemoteDescription(new RTCSessionDescription(isDataOffered));

            if (!localStreamRef.current) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    localStreamRef.current = stream;
                    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
                } catch (err) {
                    console.error("Mikrofon erişimi reddedildi veya hata oluştu:", err);
                }
            } else {
                localStreamRef.current.getTracks().forEach((track) => {
                    pc.addTrack(track, localStreamRef.current);
                });
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.send(JSON.stringify({ type: "answer", answer }));
            setIsIncomingCall(false)
            setIsCalling(true)

        } else {
            socket.send(JSON.stringify({ type: "call-rejected",message: "Karşı taraf çağrıyı reddetti" }));
            setIsIncomingCall(false);
            setPeerConnection(null)
            setIsCalling(false)
            if (peerConnection){
                peerConnection.close()
            }
            return;
        }
    }

    // Görüşmeyi sonlandırma
    const handleCloseCall = async () => {
        setIsCalling(false);
        setIsDataOffered(null);
        if (peerConnection) {
            peerConnection.close();
            socket.send(JSON.stringify({ type: "call-ended", message: "Çağrı sonlandı" }));
            setPeerConnection(false)
        }
        if (remoteAudio.current) {
            remoteAudio.current.srcObject.getTracks().forEach((track => track.stop()))
            remoteAudio.current.srcObject = null;
            console.log("Bağlantı bitirildi.");
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            console.log("Bağlantı bitirildi.");
        }
    }

    return (
        <div className="audio-chat-container">
            <h2>Sesli Sohbet</h2>

            {isIncomingCall && (
                <div className="incoming-call-box">
                    <p>Gelen arama var...</p>
                    <div className="call-buttons">
                        <button onClick={() => acceptCall(true)} className="accept-button">
                            Görüşmeyi Onayla
                        </button>
                        <button onClick={() => acceptCall(false)} className="reject-button">
                            Görüşmeyi Reddet
                        </button>
                    </div>
                </div>
            )}

            <div className="call-controls">
                <button onClick={startCall} disabled={isCalling} className="primary-button">
                    Görüşme Başlat
                </button>
                <button onClick={handleCloseCall} disabled={!peerConnection} className="secondary-button">
                    Görüşmeyi Bitir
                </button>
            </div>

            <div className="record-controls">
                {!isRecording ? (
                    <button onClick={handleStartRecording} className="record-button">
                        Kaydı Başlat
                    </button>
                ) : (
                    <button onClick={handleStopRecording} className="record-button stop">
                        Kaydı Durdur
                    </button>
                )}
                <button onClick={toggleMute} className="mute-button">
                    {isMuted ? "Unmute (Ses Aç)" : "Mute (Kapat)"}
                </button>
            </div>

            <div className="audio-section">
                <h4>Karşıdan Gelen Ses:</h4>
                <audio ref={remoteAudio} autoPlay controls className="remote-audio"/>
            </div>

            {recordedURL && (
                <div className="recorded-audio-container">
                    <h4>Kaydedilen Ses:</h4>
                    <audio src={recordedURL} controls className="recorded-audio"/>
                    <p>
                        İsterseniz bu ses dosyasını sağ tıklayıp sesi farklı kaydet şeklinde
                        indirebilirsiniz.
                    </p>
                </div>
            )}
        </div>
    );
};

export default AudioChat;
