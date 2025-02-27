import React, { useState, useEffect } from "react";
import "../css/Voting.css";

const Voting = ({ socket }) => {
    const [votes, setVotes] = useState({ yes: 0, no: 0 });

    useEffect(() => {
        const handleMessage = async (event) => {
            let data;
            if (event.data instanceof Blob) {
                data = await event.data.text().then(JSON.parse);
            } else {
                data = JSON.parse(event.data);
            }

            if (data.type === "vote") {
                setVotes((prevVotes) => ({
                    ...prevVotes,
                    [data.option]: prevVotes[data.option] + 1
                }));
            }
        };

        socket.addEventListener("message", handleMessage);

        return () => {
            socket.removeEventListener("message", handleMessage);
        };
    }, [socket]);

    const sendVote = (option) => {
        setVotes((prevVotes) => ({
            ...prevVotes,
            [option]: prevVotes[option] + 1
        }));

        socket.send(JSON.stringify({ type: "vote", option }));
    };

    return (
        <div className="voting-container">
            <h2>Gerçek Zamanlı Oylama</h2>
            <div className="vote-buttons">
                <button className="yes-button" onClick={() => sendVote("yes")}>
                    Evet
                </button>
                <button className="no-button" onClick={() => sendVote("no")}>
                    Hayır
                </button>
            </div>
            <p className="vote-results">
                Oy Durumu: <strong>{votes.yes}</strong> Evet, <strong>{votes.no}</strong> Hayır
            </p>
        </div>
    );
};

export default Voting;
