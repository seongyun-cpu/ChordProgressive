// ChordController.ino — 코드 맵을 손으로 "화살표 따라" 연주하는 컨트롤러
// 보드: Arduino Uno/Nano, 시리얼 115200
//
// 배선 (버튼은 핀 ↔ GND, 내부 풀업이라 저항 불필요)
//   D2  PREV   : 다음 후보 왼쪽으로
//   D3  NEXT   : 다음 후보 오른쪽으로
//   D4  PICK   : 고른 후보를 진행에 추가
//   D5  UNDO   : 마지막 코드 삭제
//   D6  PLAY   : 재생/정지 토글
//   D7  WALK   : 화살표 따라 자동 산책 (길게 누르면 CLEAR)
//   A0  BPM    : 가변저항 가운데 핀 (양끝 5V / GND)
//   D13 LED    : 웹앱이 코드를 울릴 때 깜빡
// (로터리 엔코더를 쓰고 싶다면 CLK/DT를 D2/D3에 연결하고 readEncoder()를 사용)

const int PIN_PREV = 2, PIN_NEXT = 3, PIN_PICK = 4, PIN_UNDO = 5, PIN_PLAY = 6, PIN_WALK = 7;
const int PIN_BPM = A0, PIN_LED = 13;
const int BUTTONS[] = {PIN_PREV, PIN_NEXT, PIN_PICK, PIN_UNDO, PIN_PLAY, PIN_WALK};
const char* CMDS[]  = {"PREV",   "NEXT",   "PICK",   "UNDO",   "PLAY",   "WALK"};
const int NB = 6;

bool down[NB];
unsigned long changedAt[NB], pressedAt[NB];
bool longFired[NB];
const unsigned long DEBOUNCE = 25, LONGPRESS = 700;

int lastBpm = -1;
unsigned long ledOffAt = 0;
String rx;

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < NB; i++) pinMode(BUTTONS[i], INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
}

void loop() {
  unsigned long now = millis();

  for (int i = 0; i < NB; i++) {
    bool s = digitalRead(BUTTONS[i]) == LOW;
    if (s != down[i] && now - changedAt[i] > DEBOUNCE) {
      changedAt[i] = now;
      down[i] = s;
      if (s) { pressedAt[i] = now; longFired[i] = false; }
      // WALK는 짧게 뗐을 때만 보냄 (길게 누르면 CLEAR)
      if (!s && BUTTONS[i] == PIN_WALK && !longFired[i]) Serial.println("WALK");
      if (s && BUTTONS[i] != PIN_WALK) Serial.println(CMDS[i]);
    }
    if (down[i] && BUTTONS[i] == PIN_WALK && !longFired[i] && now - pressedAt[i] > LONGPRESS) {
      longFired[i] = true;
      Serial.println("CLEAR");
    }
  }

  int bpm = map(analogRead(PIN_BPM), 0, 1023, 60, 180);
  if (abs(bpm - lastBpm) >= 2) { lastBpm = bpm; Serial.print("BPM "); Serial.println(bpm); }

  // 웹 → 아두이노: "CHORD Am"
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      if (rx.startsWith("CHORD")) { digitalWrite(PIN_LED, HIGH); ledOffAt = now + 120; }
      // TODO: OLED가 있다면 rx.substring(6)을 크게 표시
      rx = "";
    } else rx += c;
  }
  if (ledOffAt && now > ledOffAt) { digitalWrite(PIN_LED, LOW); ledOffAt = 0; }
}
