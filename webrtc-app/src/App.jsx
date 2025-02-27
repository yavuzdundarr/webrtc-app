import React from "react";
import AudioChat from "./components/AudioChat";
import Voting from "./components/Voting";
import "./App.css"

const socket = new WebSocket("ws://localhost:8080");

function App() {
    return (
        <div className="AppContainer">
            <AudioChat socket={socket} />
            <Voting socket={socket} />
        </div>
    );
}

export default App;
