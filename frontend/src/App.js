import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const API = BACKEND_URL ? `${BACKEND_URL}/api` : "";

const Home = () => {
  const [backendStatus, setBackendStatus] = useState("unknown");

  useEffect(() => {
    if (!API) {
      setBackendStatus("disconnected");
      return;
    }

    const checkBackend = async () => {
      try {
        const response = await axios.get(`${API}/`, { timeout: 5000 });
        console.log(response.data.message);
        setBackendStatus("connected");
      } catch (e) {
        console.error("Backend unreachable:", e.message);
        setBackendStatus("disconnected");
      }
    };

    checkBackend();
  }, []);

  return (
    <div>
      <header className="App-header">
        <h1>Commitly</h1>
        <p className="mt-5">Task Tracker</p>
        {backendStatus === "connected" && (
          <p className="mt-3 text-green-400">Backend connected</p>
        )}
        {backendStatus === "disconnected" && (
          <p className="mt-3 text-yellow-400">
            Backend unavailable — running in offline mode
          </p>
        )}
      </header>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
