import express from "express";
import { datasetSynthesizer } from "../datasetSynthesizer.js";
import { genId } from '@shared/core/idGen';

export function registerSynthesizerRoutes(app: express.Express, db: any) {
  app.get("/api/cortex/synthesizer/status", (req, res) => {
    try {
      res.json({
        success: true,
        config: datasetSynthesizer.getConfig(),
        state: datasetSynthesizer.getStats(),
        logs: datasetSynthesizer.getLogs()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cortex/synthesizer/configure", express.json(), (req, res) => {
    try {
      datasetSynthesizer.updateConfig(req.body);
      res.json({
        success: true,
        config: datasetSynthesizer.getConfig(),
        state: datasetSynthesizer.getStats()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cortex/synthesizer/control", express.json(), async (req, res) => {
    try {
      const { action } = req.body;
      if (action === "start") {
        await datasetSynthesizer.startDaemon();
      } else if (action === "stop") {
        datasetSynthesizer.stopDaemon();
      } else if (action === "reset") {
        await datasetSynthesizer.resetAll();
      } else if (action === "retry_pool") {
        await datasetSynthesizer.retryPool();
      } else {
        return res.status(400).json({ error: `Aksi tidak dikenal: ${action}` });
      }
      res.json({
        success: true,
        state: datasetSynthesizer.getStats(),
        logs: datasetSynthesizer.getLogs()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cortex/synthesizer/synthesize-single", express.json(), async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: "Record ID wajib dilampirkan." });
      }
      const outcome = await datasetSynthesizer.processSingle(id);
      res.json({
        success: outcome.success,
        error: outcome.error,
        result: outcome.result,
        state: datasetSynthesizer.getStats()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Synaptic Dataset CRUD Endpoints ---
  app.get("/api/cortex/synthesizer/records", (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT id, content, timestamp FROM memories 
        WHERE type = 'airi_synthesized'
        ORDER BY timestamp DESC
      `).all();

      const records = rows.map((r: any) => {
        let parsed: any = {};
        try {
          parsed = JSON.parse(r.content);
        } catch (_) {}

        return {
          id: r.id,
          userQuery: parsed.userQuery || "",
          targetSpeech: parsed.targetSpeech || "",
          synthesized: parsed.synthesized || {},
          timestamp: r.timestamp
        };
      });

      res.json({ success: true, records });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cortex/synthesizer/records", express.json(), (req, res) => {
    try {
      const { userQuery, targetSpeech, thought, animations, mood_impact } = req.body;
      const id = "man_" + genId(9);
      const timestamp = Date.now();

      const synthesizedBlock = {
        thought: thought || "",
        animations: animations || ["SMILE"],
        mood_impact: mood_impact || { joy: 1 },
        tool_calls: [
          {
            tool: "final_answer",
            args: {
              speech: targetSpeech || "",
              animations: animations || ["SMILE"]
            }
          }
        ]
      };

      const contentObj = {
        userQuery: userQuery || "",
        targetSpeech: targetSpeech || "",
        synthesized: synthesizedBlock
      };

      db.prepare(`
        INSERT INTO memories (id, type, content, importance, tags, context, sentiment, timestamp, speaker)
        VALUES (?, 'airi_synthesized', ?, 0.8, ?, NULL, 0, ?, 'System')
      `).run(
        id,
        JSON.stringify(contentObj, null, 2),
        JSON.stringify(["airi", "synthesized", "mhcp_v1"]),
        timestamp
      );

      res.json({
        success: true,
        record: {
          id,
          userQuery: contentObj.userQuery,
          targetSpeech: contentObj.targetSpeech,
          synthesized: contentObj.synthesized,
          timestamp
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/cortex/synthesizer/records/:id", express.json(), (req, res) => {
    try {
      const { id } = req.params;
      const { userQuery, targetSpeech, thought, animations, mood_impact } = req.body;

      const synthesizedBlock = {
        thought: thought || "",
        animations: animations || ["SMILE"],
        mood_impact: mood_impact || { joy: 1 },
        tool_calls: [
          {
            tool: "final_answer",
            args: {
              speech: targetSpeech || "",
              animations: animations || ["SMILE"]
            }
          }
        ]
      };

      const contentObj = {
        userQuery: userQuery || "",
        targetSpeech: targetSpeech || "",
        synthesized: synthesizedBlock
      };

      const info = db.prepare(`
        UPDATE memories 
        SET content = ?
        WHERE id = ? AND type = 'airi_synthesized'
      `).run(JSON.stringify(contentObj, null, 2), id);

      if (info.changes === 0) {
        return res.status(404).json({ error: "Record tidak ditemukan atau bukan tipe synthesized" });
      }

      res.json({
        success: true,
        record: {
          id,
          userQuery: contentObj.userQuery,
          targetSpeech: contentObj.targetSpeech,
          synthesized: contentObj.synthesized
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/cortex/synthesizer/records/:id", (req, res) => {
    try {
      const { id } = req.params;
      const info = db.prepare(`
        DELETE FROM memories 
        WHERE id = ? AND type = 'airi_synthesized'
      `).run(id);

      if (info.changes === 0) {
        return res.status(404).json({ error: "Record tidak ditemukan atau bukan tipe synthesized" });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Yuihime dataset neuromorphic training exporter ---
  // Routes will be injected here
}
