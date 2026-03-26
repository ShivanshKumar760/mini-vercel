// App.js
import { useState } from "react";
import axios from "axios";

function App() {
  const [repo, setRepo] = useState("");
  const [projectName, setProjectName] = useState("");

  const deploy = async () => {
    const res = await axios.post("http://localhost:5000/api/projects/create", {
      name: projectName,
      githubUrl: repo,
    });

    alert(res.data.url);
  };

  return (
    <div>
      <h1>Mini Vercel</h1>
      <input
        placeholder="project name"
        onChange={(e) => {
          setProjectName(e.target.value);
        }}
      />
      <input onChange={(e) => setRepo(e.target.value)} />
      <button onClick={deploy}>Deploy</button>
    </div>
  );
}

export default App;
