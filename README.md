# ChordProgressive

원형 코드 맵에서 화살표를 따라 코드 진행을 만들고 재생하는 음악 도구입니다.

공개 사이트: https://chord-lab-map-1104.smoothherring.chatgpt.site/

## 코드 확인

VS Code에서 이 폴더를 열거나 `ChordProgressive.code-workspace`를 여세요. 이 프로젝트는 자체 `.git`과 `main` 브랜치를 가진 독립 저장소입니다. 다른 프로젝트의 파일·브랜치·원격 저장소 설정을 공유하지 않습니다.

| 파일 | 역할 |
| --- | --- |
| `web/app.js` | SVG 코드 맵, 화면 상태와 버튼 동작 |
| `web/theory.js` | 화성 이론, 그래프, 코드 인식 |
| `web/audio.js` | Web Audio 재생과 스케줄러 |
| `web/shortcuts.js` | 키보드 단축키 |
| `web/storage.js` | 진행 저장, URL 공유, MIDI/PNG 출력 |
| `web/midi-input.js` | 외부 MIDI 건반 입력 |
| `web/index.html`, `web/style.css` | 화면 구조와 스타일 |
| `web/*.test.js` | 자동 테스트 |
| `arduino/ChordController/ChordController.ino` | 아두이노 컨트롤러 |
| `matlab/analyze_progression.m` | 내보낸 진행의 합성·분석 |

## 로컬 실행

Node.js 22.12 이상에서 실행합니다.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run check
npm run build
```

## 현재 동작

- 첫 화면은 빈 진행이며, 장조·단조·도미넌트7·감7로 시작할 수 있습니다.
- °는 감7화음을 뜻하며 맵 아래에 설명이 표시됩니다.
- 코드 회전, 추가 화성, 음색/리듬, 저장/공유, MIDI/PNG 출력 기능이 있습니다.
- 사슴 장식과 릴스 모드는 제거되어 있습니다.
- 되돌리기: Mac ⌘Z / Windows Ctrl+Z
- 비우기: Mac ⌘X / Windows Ctrl+X
- 자동 산책 A, 반복 L, 재생/정지 Space
- 입력란에서는 기본 편집 단축키를 유지합니다.

## Git 및 배포

기존 코드의 변경 이력을 보존한 별도 로컬 Git 저장소입니다. 다른 프로젝트의 Git 원격 주소를 재사용하지 않습니다.

`.openai/hosting.json`은 현재 공개 Sites 프로젝트의 배포 식별자입니다. 인증 토큰은 포함하지 않습니다. 로컬 커밋이나 GitHub 업로드만으로 공개 사이트가 자동 변경되지는 않으며, Sites 배포가 별도로 필요합니다. 기존 공개 사이트는 유지됩니다.

실물 MIDI/아두이노 연결과 MATLAB 실행은 별도 장치 환경에서 확인해야 합니다.
