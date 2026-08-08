/**
 * 보안 규칙 테스트 실행기.
 *
 * Firestore 에뮬레이터는 자바가 있어야 돈다. 그런데 이 PC에는 자바를 따로 설치하지 않았고,
 * 설치할 필요도 없다 — Android Studio 안에 JDK 21 이 들어 있다.
 * 이 파일이 자바를 알아서 찾아 주므로, 환경변수를 손댈 필요가 없다.
 *
 *   npm run test:rules
 */
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

const CANDIDATES = [
    process.env.JAVA_HOME,
    'C:/Program Files/Android/Android Studio/jbr',
    'C:/Program Files/Android/Android Studio/jre',
    `${process.env.LOCALAPPDATA || ''}/Programs/Android Studio/jbr`,
    'C:/Program Files/Eclipse Adoptium/jdk-21',
    'C:/Program Files/Microsoft/jdk-21',
].filter(Boolean);

const findJavaHome = () => {
    for (const base of CANDIDATES) {
        const exe = path.join(base, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
        if (existsSync(exe)) return base;
    }
    return null;
};

const javaHome = findJavaHome();
if (!javaHome) {
    console.error(
        '\n자바를 찾지 못했습니다.\n' +
        'Firestore 에뮬레이터는 자바가 필요합니다. 보통 Android Studio 안에 들어 있습니다.\n' +
        '설치되어 있다면 JAVA_HOME 환경변수를 그 경로로 지정한 뒤 다시 실행해 주세요.\n' +
        '없다면 https://adoptium.net 에서 JDK 21(Temurin)을 받으시면 됩니다.\n'
    );
    process.exit(1);
}

console.log(`자바: ${javaHome}\n`);

const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH}`,
};

/* 셸에 통째로 넘긴다.
   인자를 배열로 주면서 shell:true 를 함께 쓰면 따옴표가 사라져
   'node tests/rules.test.mjs' 가 두 개의 인자로 쪼개진다. */
const child = spawn(
    'npx firebase emulators:exec --only firestore "node tests/rules.test.mjs"',
    { stdio: 'inherit', env, shell: true }
);

child.on('exit', (code) => process.exit(code ?? 1));
