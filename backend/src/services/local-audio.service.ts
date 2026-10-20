import { spawn } from "node:child_process";
import path from "node:path";
import { AudioRejectedError } from "../domain/audio";

export function transcribeLocalAudio(bytes: Buffer): Promise<string> {
  const python = process.env.LOCAL_WHISPER_PYTHON;
  if (!python || !path.isAbsolute(python) || !process.env.LOCAL_WHISPER_CACHE) throw new AudioRejectedError("Transcrição local indisponível.");
  return new Promise((resolve,reject) => {
    // Direct process execution, no shell and no temporary voice files.
    const child = spawn(python,[path.resolve(__dirname,"../../scripts/transcribe-local.py")],{
      windowsHide:true,stdio:["pipe","pipe","ignore"],env:{...process.env,HF_HUB_OFFLINE:"1",HF_HUB_DISABLE_TELEMETRY:"1"},
    });
    let output = "", finished = false;
    const finish = (error?: Error, text?: string) => {
      if (finished) return; finished = true; clearTimeout(timer);
      error ? reject(error) : resolve(text!);
    };
    const timer = setTimeout(()=>{child.kill();finish(new Error("Transcrição local excedeu o prazo."));},45000);
    child.on("error",()=>finish(new Error("Não foi possível iniciar transcrição local.")));
    child.stdin.on("error",()=>{}); // Early exit is handled by close/error.
    child.stdout.on("data",(chunk:Buffer)=>{
      output += chunk.toString("utf8");
      if (output.length > 100000) {child.kill();finish(new AudioRejectedError("Transcrição longa demais."));}
    });
    child.on("close",code=>{
      if (code === 2) return finish(new AudioRejectedError("Não foi possível entender esse áudio."));
      if (code !== 0) return finish(new Error("Transcrição local indisponível."));
      try {
        const result = JSON.parse(output);
        if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 16000) throw new Error();
        finish(undefined,result.text.trim());
      } catch { finish(new AudioRejectedError("Transcrição local inválida.")); }
    });
    child.stdin.end(bytes);
  });
}
