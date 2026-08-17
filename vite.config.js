

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        

        // Main
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        inventory: resolve(__dirname, "inventory.html"),
        commandcenter: resolve(__dirname, "commandcenter.html"),
        master_admin: resolve(__dirname, "master_admin.html"),
        counts: resolve(__dirname, "analytics.html"),
        backup: resolve(__dirname, "index_backup.html"),
        performance: resolve(__dirname, "performance.html"),
        engineering: resolve(__dirname, "engineering.html"),

        // Department pages
        haem: resolve(__dirname, "index_haem.html"),
        biochem: resolve(__dirname, "index_biochem.html"),
        backroom: resolve(__dirname, "index_backroom.html"),
        coag: resolve(__dirname, "index_coag.html"),
        validator: resolve(__dirname, "index_validator.html"),
        inside_lab : resolve(__dirname, "index_inside_lab.html"),
        outsource : resolve(__dirname, "index_outsource.html"),
        critical : resolve(__dirname, "Critical.html"),


        // Owner pages
        owner: resolve(__dirname, "index_owner.html"),
        owner_haem: resolve(__dirname, "index_owner_haem.html"),
        owner_coag: resolve(__dirname, "index_owner_coag.html"),
        owner_urine: resolve(__dirname, "index_owner_urine.html"),
        owner_esr: resolve(__dirname, "owner_esr.html"),
        owner_serology: resolve(__dirname, "owner_serology.html"),
        owner_rapid: resolve(__dirname, "owner_rapid.html"),
        owner_hormones: resolve(__dirname, "owner_hormones.html"),
        owner_biochem: resolve(__dirname, "owner_biochem.html"),
        owner_bloodgroup: resolve(__dirname, "owner_bloodgroup.html"),
        owner_outsource: resolve(__dirname, "owner_outsource.html"),
        owner_inside_lab: resolve(__dirname, "owner_lab.html"),
        owner_sales: resolve(__dirname, "owner_sales.html"),
        owner_ops_report: resolve(__dirname, "owner_ops_report.html"),
        operation_map: resolve(__dirname, "operation_map.html"),
        operation_map_staff: resolve(__dirname, "operation_map_staff.html"),


      },
    },
  },
});