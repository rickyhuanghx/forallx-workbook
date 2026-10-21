import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "katex/dist/katex.min.css";
import "./styles.css";
import { App } from "./App";
import { Home } from "./pages/Home";
import { Reader } from "./pages/Reader";
import { Glossary } from "./pages/Glossary";
import { About } from "./pages/About";
import { Search } from "./pages/Search";
import { Lab } from "./pages/Lab";
import { Exercises } from "./pages/Exercises";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Home />} />
          <Route path="/read/:id" element={<Reader />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route path="/search" element={<Search />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
