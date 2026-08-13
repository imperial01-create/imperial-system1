/* [src/components/ErrorBoundary.js]
   화면 한 곳이 터졌을 때 앱 전체가 흰 화면이 되는 것을 막습니다.

   왜 필요한가:
   React 는 렌더 도중 오류가 나면 트리 전체를 언마운트합니다.
   지연 로딩(React.lazy) 화면이 40개가 넘는데 경계가 한 곳도 없어서,
   어느 메뉴에서 무슨 오류가 나든 결과가 똑같이 "흰 화면"이었습니다.
   원인을 화면에서 읽을 수 없으니 매번 코드를 뒤져야 했습니다.

   이제는 터진 화면만 오류 카드로 바뀌고, 좌측 메뉴와 나머지 화면은 살아 있습니다.
   오류 메시지는 접어 두되 펼쳐서 그대로 복사할 수 있게 둡니다. */
import React from 'react';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, info: null, copied: false };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        this.setState({ info });
        console.error(`[화면 오류] ${this.props.label || '알 수 없는 화면'}`, error, info);
    }

    /* 다른 메뉴로 이동하면 오류 상태를 풀어 줍니다.
       이게 없으면 한 번 터진 뒤 메뉴를 옮겨도 오류 카드가 계속 남습니다. */
    componentDidUpdate(prevProps) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
            this.setState({ error: null, info: null, copied: false });
        }
    }

    handleCopy = () => {
        const { error, info } = this.state;
        const text = [
            `화면: ${this.props.label || '-'}`,
            `주소: ${typeof window !== 'undefined' ? window.location.hash || window.location.pathname : '-'}`,
            `오류: ${error?.message || error}`,
            '',
            (error?.stack || ''),
            '--- 컴포넌트 위치 ---',
            (info?.componentStack || '')
        ].join('\n');
        try {
            navigator.clipboard.writeText(text);
            this.setState({ copied: true });
        } catch (e) {
            console.error('복사 실패', e);
        }
    };

    render() {
        const { error, info, copied } = this.state;
        if (!error) return this.props.children;

        /* 배포 직후, 열어 둔 탭은 옛 index.html 을 들고 있습니다.
           아직 안 들어가 본 메뉴로 이동하면 이미 교체된 파일을 요청해 404 가 납니다.
           코드 결함이 아니라 새로고침으로 끝나는 일이므로 따로 안내합니다. */
        const msg = String(error?.message || '');
        const isStaleBuild = /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg)
            || error?.name === 'ChunkLoadError';

        if (isStaleBuild) {
            return (
                <div className="max-w-md mx-auto my-16 text-center">
                    <div className="bg-white border border-blue-200 rounded-2xl shadow-sm p-8">
                        <RefreshCw className="mx-auto text-blue-600 mb-4" size={32} />
                        <h3 className="font-bold text-gray-900 text-lg">새 버전이 배포되었습니다</h3>
                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                            열어 두신 화면이 이전 버전이라 이 메뉴를 불러오지 못했습니다.<br />
                            새로고침하면 바로 열립니다.
                        </p>
                        <button
                            onClick={() => window.location.reload(true)}
                            className="mt-5 px-5 py-2.5 text-sm font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                        >
                            새로고침
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="max-w-2xl mx-auto my-10">
                <div className="bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-start gap-3">
                        <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={22} />
                        <div>
                            <h3 className="font-bold text-red-900">이 화면을 여는 중 오류가 났습니다</h3>
                            <p className="text-sm text-red-700 mt-1">
                                다른 메뉴는 그대로 쓸 수 있습니다. 아래 내용을 복사해 개발 담당에게 전달해 주세요.
                            </p>
                        </div>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                        <div className="text-sm">
                            <span className="text-gray-500">화면</span>
                            <span className="ml-2 font-bold text-gray-900">{this.props.label || '알 수 없음'}</span>
                        </div>
                        <div className="bg-gray-900 text-red-300 rounded-lg p-3 text-xs font-mono break-all">
                            {String(error?.message || error)}
                        </div>

                        <details className="text-xs">
                            <summary className="cursor-pointer text-gray-600 font-bold py-1">자세한 위치 보기</summary>
                            <pre className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-64 text-[11px] text-gray-700 whitespace-pre-wrap">
{(error?.stack || '') + '\n--- 컴포넌트 위치 ---\n' + (info?.componentStack || '')}
                            </pre>
                        </details>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={this.handleCopy}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg border border-gray-300 hover:bg-gray-50"
                            >
                                <Copy size={14} /> {copied ? '복사했습니다' : '오류 내용 복사'}
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                            >
                                <RefreshCw size={14} /> 새로고침
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
