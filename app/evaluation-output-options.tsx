"use client";

import type { EvaluationOutputOptions, ReportFormat } from "@/lib/class-config";

export default function EvaluationOutputOptionsField({
  value,
  onChange,
  allowGoogleDocsAppend,
  googleAuth,
}: {
  value: EvaluationOutputOptions;
  onChange: (value: EvaluationOutputOptions) => void;
  allowGoogleDocsAppend: boolean;
  googleAuth?: {
    configured: boolean;
    connected: boolean;
    connectHref: string;
  };
}) {
  function update(patch: Partial<EvaluationOutputOptions>) {
    onChange({ ...value, ...patch });
  }

  return (
    <fieldset className="output-options">
      <legend>평가 결과 제공 방식 <b>*</b></legend>
      <p>학생에게 제공할 방식을 하나 이상 선택하세요. 선택 내용은 이 평가에 함께 저장됩니다.</p>

      <label className={value.showOnScreen ? "selected" : ""}>
        <input
          type="checkbox"
          checked={value.showOnScreen}
          onChange={(event) => update({ showOnScreen: event.target.checked })}
        />
        <span className="option-number">01</span>
        <span>
          <strong>화면 아래에 결과 표시</strong>
          <small>평가가 끝나면 결과 영역으로 자동 스크롤합니다.</small>
        </span>
      </label>

      {allowGoogleDocsAppend && (
        <div className="output-option-group">
          <label className={value.appendToGoogleDoc ? "selected" : ""}>
            <input
              type="checkbox"
              checked={value.appendToGoogleDoc}
              onChange={(event) => update({ appendToGoogleDoc: event.target.checked })}
            />
            <span className="option-number">02</span>
            <span>
              <strong>Google Docs 하단에 평가 추가</strong>
              <small>제출한 문서의 마지막에 점수와 피드백을 덧붙입니다.</small>
            </span>
          </label>
          {value.appendToGoogleDoc && (
            <div className="docs-ownership-notice">
              <strong>교사 계정이 소유한 문서만 사용할 수 있어요.</strong>
              <p>교사가 자신의 Google 계정에서 문서를 만든 뒤 학생에게 편집 권한을 주세요. 학생이 직접 생성하고 소유한 문서에는 평가를 추가할 수 없습니다.</p>
              {googleAuth?.connected ? (
                <div className="google-auth-state connected">
                  <span>Google 계정 연결됨</span>
                  <a href={googleAuth.connectHref}>다른 계정으로 다시 연결</a>
                </div>
              ) : googleAuth?.configured ? (
                <div className="google-auth-state">
                  <span>이 기능을 사용하려면 교사의 Google 계정 인증이 필요합니다.</span>
                  <a href={googleAuth.connectHref}>Google 계정 연결하기</a>
                </div>
              ) : (
                <div className="google-auth-state">
                  <span>현재 플랫폼의 Google OAuth 설정이 필요합니다.</span>
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
                    Google Cloud 인증 설정 열기
                  </a>
                  <small>Google Docs API와 Google Drive API를 사용 설정하고 OAuth 웹 클라이언트를 만들어야 합니다.</small>
                  <small>승인된 리디렉션 URI: https://feedforward.kr/api/google/oauth/callback</small>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <label className={value.reportFormat !== "none" ? "selected" : ""}>
        <input
          type="checkbox"
          checked={value.reportFormat !== "none"}
          onChange={(event) => update({
            reportFormat: event.target.checked ? "pdf" : "none",
          })}
        />
        <span className="option-number">{allowGoogleDocsAppend ? "03" : "02"}</span>
        <span>
          <strong>보고서 파일 제공</strong>
          <small>정해진 보고서 틀에 평가 데이터만 채워 토큰을 추가로 사용하지 않습니다.</small>
        </span>
        {value.reportFormat !== "none" && (
          <select
            aria-label="보고서 파일 형식"
            value={value.reportFormat}
            onChange={(event) => update({
              reportFormat: event.target.value as ReportFormat,
            })}
            onClick={(event) => event.stopPropagation()}
          >
            <option value="pdf">PDF 보고서</option>
            <option value="html">HTML 보고서</option>
          </select>
        )}
      </label>
    </fieldset>
  );
}
