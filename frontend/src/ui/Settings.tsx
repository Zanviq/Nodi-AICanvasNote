import { useState } from "react";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import type { Sensitivity } from "../question/gesture";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`switch${on ? " on" : ""}`} />
    </button>
  );
}

export function Settings() {
  const s = useSettings();
  const config = useUi((x) => x.config);
  const close = () => useUi.getState().setSettingsOpen(false);
  const [key, setKey] = useState(s.geminiKey);
  const [token, setToken] = useState(s.accessToken);
  const [show, setShow] = useState(false);

  const save = () => {
    s.set({ geminiKey: key.trim(), accessToken: token.trim() });
    close();
  };

  const keyStatus = config?.serverKey
    ? "서버에 키가 있어요. 여기에 넣은 키가 있으면 그 키를 먼저 써요."
    : key.trim()
      ? "이 키는 이 기기 브라우저에만 저장되고, 질문할 때만 서버로 보내요."
      : "서버에 키가 없어요. 질문하려면 Gemini API 키를 넣어 주세요.";

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">설정</h2>

        <label className="field">
          <span>Gemini API 키</span>
          <input type={show ? "text" : "password"} value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" autoComplete="off" spellCheck={false} />
          <span className={`status-line${!config?.serverKey && !key.trim() ? " warn" : ""}`}>{keyStatus}</span>
          <button className="chip quiet" onClick={() => setShow(!show)} style={{ alignSelf: "flex-start" }}>
            {show ? "키 숨기기" : "키 보기"}
          </button>
        </label>

        <label className="field">
          <span>접근 코드</span>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
          <span className={`status-line${config?.accessRequired && !token.trim() ? " warn" : ""}`}>
            {config?.accessRequired ? "이 서버는 접근 코드가 있어야 써요. 서버의 APP_ACCESS_TOKEN 값을 넣어 주세요." : "이 서버는 접근 코드가 필요 없어요."}
          </span>
        </label>

        <div className="field">
          <Toggle label="두 번 톡 해서 질문하기" on={s.doubleTap} onChange={(v) => s.set({ doubleTap: v })} />
          <div className="row">
            <span>두 번 톡 민감도</span>
            <div className="seg" role="radiogroup" aria-label="두 번 톡 민감도">
              {(["좁게", "보통", "넓게"] as const).map((label, i) => (
                <button key={label} role="radio" aria-checked={s.sensitivity === i} className={s.sensitivity === i ? "on" : ""} onClick={() => s.set({ sensitivity: i as Sensitivity })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="hint">「넓게」는 더 느리게, 조금 떨어진 자리에 톡 해도 질문으로 봐요.</span>
          <Toggle label="마우스 두 번 클릭도 질문으로" on={s.allowMouse} onChange={(v) => s.set({ allowMouse: v })} />
          <Toggle label="왼손잡이" on={s.leftHanded} onChange={(v) => s.set({ leftHanded: v })} />
          <Toggle label="연구용 사용 기록 보내기" on={s.research} onChange={(v) => s.set({ research: v })} />
          <span className="hint">동의하면 질문 범위, 취소, 걸린 시간 같은 사용 기록을 서버에 남겨요. 필기 이미지는 남기지 않아요.</span>
        </div>

        {config && (
          <span className="status-line">
            인식 모델 {config.visionModel}, 답 모델 {config.answerModel}
          </span>
        )}
        {!config && <span className="status-line warn">서버에 연결할 수 없어요.</span>}

        <div className="foot">
          <button className="chip" onClick={close}>
            닫기
          </button>
          <button className="chip primary" onClick={save}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
