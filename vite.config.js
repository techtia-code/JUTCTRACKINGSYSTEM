import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: "index.html",
        admin: "admin.html",
        driver: "driver.html"
      }
    }
  }
});
