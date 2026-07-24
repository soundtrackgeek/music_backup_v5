import "./app/themeBootstrap";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AlbumCoverPreviewProvider } from "./components/AlbumCover";
import "flag-icons/css/flag-icons.min.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AlbumCoverPreviewProvider>
      <App />
    </AlbumCoverPreviewProvider>
  </React.StrictMode>,
);

