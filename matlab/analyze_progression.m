% analyze_progression.m — 웹앱에서 내보낸 progression.json을 불러와
% 1) 오디오로 합성(.wav 저장)  2) 피아노롤  3) 보이스 리딩 이동량 분석
clear; clc;

[f, p] = uigetfile('*.json', 'progression.json 선택');
if isequal(f, 0), return; end
data = jsondecode(fileread(fullfile(p, f)));

fs  = 44100;
beats = 4; % 예전 JSON은 4박으로 읽는다
if isfield(data, 'beats'), beats = data.beats; end
barSec = beats * 60 / data.bpm;            % 코드 하나 = 1마디(초)
n   = numel(data.chords);
if n == 0, error('진행에 코드가 없습니다.'); end
t   = 0:1/fs:barSec - 1/fs;
env = min(1, t/0.02) .* exp(-t/(barSec*0.8));   % 간단한 ADSR 대체 엔벨로프

y = [];
midiAll = cell(n, 1);
for k = 1:n
    midi = data.chords(k).midi(:)';
    midiAll{k} = midi;
    seg = zeros(size(t));
    for m = midi
        fHz = 440 * 2^((m - 69)/12);
        seg = seg + sin(2*pi*fHz*t) + 0.3*sin(2*pi*2*fHz*t);  % 기음 + 2배음
    end
    y = [y, seg .* env / numel(midi)]; %#ok<AGROW>
end
y = 0.8 * y / max(abs(y));
audiowrite('progression.wav', y, fs);
sound(y, fs);

% ----- 피아노롤 -----
figure('Name', 'Piano roll');
hold on;
for k = 1:n
    for m = midiAll{k}
        rectangle('Position', [(k-1)*barSec, m-0.4, barSec*0.95, 0.8], ...
                  'FaceColor', [1 0.7 0.3], 'EdgeColor', 'none');
    end
    text((k-1)*barSec + 0.05, max(midiAll{k}) + 1.5, data.chords(k).name, 'FontWeight', 'bold');
end
xlabel('Time (s)'); ylabel('MIDI note');
title(sprintf('%s · %d BPM', strjoin({data.chords.name}, ' → '), data.bpm));
grid on; hold off;

% ----- 보이스 리딩 이동량 (반음 합) -----
moves = zeros(1, n-1);
for k = 2:n
    a = sort(midiAll{k-1}); b = sort(midiAll{k});
    L = min(numel(a), numel(b));
    moves(k-1) = sum(abs(a(1:L) - b(1:L)));
end
figure('Name', 'Voice leading');
bar(moves);
xticklabels(arrayfun(@(k) sprintf('%s→%s', data.chords(k).name, data.chords(k+1).name), ...
             1:n-1, 'UniformOutput', false));
ylabel('총 이동 반음 수'); title('코드 간 보이스 리딩 이동량');

% ----- 스펙트로그램 -----
figure('Name', 'Spectrogram');
spectrogram(y, 2048, 1536, 4096, fs, 'yaxis'); ylim([0 2]);
title('합성 결과 스펙트로그램');
