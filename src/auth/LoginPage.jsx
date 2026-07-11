
// LoginPage.jsx

import React, { useState } from "react";
import { users, departments } from "./users";
import "./LoginPage.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");

  
  const login = () => {
    const user = users.find(
      u =>
        u.username === username &&
        u.password === password
    );
  
    if (!user) {
      alert("Invalid credentials");
      return;
    }
  
    if (department === "") {
      alert("Please select a department");
      return;
    }

    const selectedDept = departments[department];
  
    sessionStorage.setItem(
      "loggedUser",
      user.username
    );
  
    sessionStorage.setItem(
      "department",
      selectedDept?.name || ""
    );

    sessionStorage.removeItem("loginMode");

    if (selectedDept?.loginMode) {
      sessionStorage.setItem(
        "loginMode",
        selectedDept.loginMode
      );
    }
  
    window.location.href = selectedDept.url;
  };


  return (
    <div className="login-page">

      <div className="login-card">

        <h2>Prototype Lab System</h2>

        <input
          placeholder="Username"
          value={username}
          onChange={(e)=>setUsername(e.target.value)}
        />

<input
  type="password"
  placeholder="Password"
  value={password}
  onChange={(e)=>setPassword(e.target.value)}
/>




<select
  value={department}
  onChange={(e) => setDepartment(e.target.value)}
>
  <option value="">
    Select Department
  </option>

  {departments.map((dept, index) => (
    <option
      key={dept.name}
      value={index}
    >
      {dept.name}
    </option>
  ))}
</select>


<button onClick={login}>
  Login
</button>

      </div>

    </div>
  );
}