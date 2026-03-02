import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { baiduAuth } from '@/services/auth.service';
import { PlaylistItem } from '@/types/file';

type OutputFormat = 'flac' | 'wav' | 'm4a';

interface CueSplitDialogProps {
  song: PlaylistItem | null;
  cuePath: string;
  cueFsId: number;
  onClose: () => void;
}

type Stage =
  | 'select-format'   // 选择输出格式
  | 'splitting'       // 正在分轨中
  | 'overwrite-ask'   // 询问是否覆盖
  | 'done'            // 完成
  | 'error';          // 错误

interface ProgressInfo {
  stage: string;
  percent: number;
  message: string;
}

interface UploadResult {
  filename: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export const CueSplitDialog: React.FC<CueSplitDialogProps> = ({
  song,
  cuePath,
  cueFsId,
  onClose,
}) => {
  const [stage, setStage] = useState<Stage>('select-format');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('flac');
  const [progress, setProgress] = useState<ProgressInfo>({ stage: '', percent: 0, message: '' });
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // 询问覆盖时的当前文件名
  const [overwriteFilename, setOverwriteFilename] = useState('');
  const taskIdRef = useRef<string>('');
  const cleanupRef = useRef<(() => void)[]>([]);

  // 清理所有监听器
  const cleanup = useCallback(() => {
    cleanupRef.current.forEach(fn => fn());
    cleanupRef.current = [];
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const handleStart = async () => {
    if (!song) return;

    const accessToken = baiduAuth.getAccessToken();
    if (!accessToken) {
      setErrorMsg('无法获取访问令牌，请重新登录');
      setStage('error');
      return;
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    taskIdRef.current = taskId;

    setStage('splitting');
    setProgress({ stage: 'init', percent: 0, message: '正在启动分轨任务...' });

    // 监听进度
    const cleanupProgress = window.electronAPI.onCueSplitProgress(taskId, (p) => {
      setProgress(p);
    });
    cleanupRef.current.push(cleanupProgress);

    // 监听"文件已存在"询问
    const cleanupFileExists = window.electronAPI.onCueSplitFileExists((data) => {
      if (data.taskId === taskId) {
        setOverwriteFilename(data.filename);
        setStage('overwrite-ask');
      }
    });
    cleanupRef.current.push(cleanupFileExists);

    try {
      const result = await window.electronAPI.cueSplit({
        audioPath: song.path,
        audioFsId: song.fs_id,
        cuePath,
        cueFsId,
        accessToken,
        outputFormat,
        taskId,
      });

      cleanup();

      if (result.success) {
        setUploadResults(result.uploadResults || []);
        setStage('done');
      } else {
        setErrorMsg(result.error || '分轨失败');
        setStage('error');
      }
    } catch (err: any) {
      cleanup();
      setErrorMsg(err.message || '未知错误');
      setStage('error');
    }
  };

  const handleOverwriteChoice = (choice: 'overwrite' | 'skip') => {
    window.electronAPI.cueSplitOverwriteChoice(taskIdRef.current, overwriteFilename, choice);
    setOverwriteFilename('');
    setStage('splitting');
  };

  const formatLabel: Record<OutputFormat, string> = {
    flac: 'FLAC（无损，推荐）',
    wav: 'WAV（无损，体积较大）',
    m4a: 'M4A-ALAC（Apple无损）',
  };

  return (
    <Dialog open={!!song} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>无损分轨</DialogTitle>
        </DialogHeader>

        {/* ===== 选择格式 ===== */}
        {stage === 'select-format' && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">源文件：</p>
              <p className="truncate text-xs bg-muted/50 rounded px-2 py-1" title={song?.server_filename}>
                {song?.server_filename}
              </p>
              <p className="font-medium text-foreground mt-2">CUE 文件：</p>
              <p
                className="text-xs bg-muted/50 rounded px-2 py-1 break-all leading-relaxed"
                title={cuePath}
                style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
              >
                {cuePath}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">请选择输出格式：</p>
              {(['flac', 'wav', 'm4a'] as OutputFormat[]).map((fmt) => (
                <label
                  key={fmt}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    outputFormat === fmt
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={fmt}
                    checked={outputFormat === fmt}
                    onChange={() => setOutputFormat(fmt)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{formatLabel[fmt]}</span>
                  {fmt === 'flac' && (
                    <span className="ml-auto text-xs text-primary font-medium">默认</span>
                  )}
                </label>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              分轨后的文件将按 CUE 文件中的曲目信息命名，并上传到源文件所在目录。
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={handleStart}>开始分轨</Button>
            </DialogFooter>
          </div>
        )}

        {/* ===== 分轨进行中 ===== */}
        {stage === 'splitting' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{progress.message}</span>
                <span className="font-medium">{progress.percent}%</span>
              </div>
              <Progress value={progress.percent} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              请勿关闭窗口，分轨可能需要几分钟...
            </p>
          </div>
        )}

        {/* ===== 询问是否覆盖 ===== */}
        {stage === 'overwrite-ask' && (
          <div className="space-y-4">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                文件已存在
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1 break-all">
                {overwriteFilename}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              网盘中已存在同名文件，请选择操作：
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => handleOverwriteChoice('skip')}>
                跳过
              </Button>
              <Button variant="destructive" onClick={() => handleOverwriteChoice('overwrite')}>
                覆盖
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ===== 完成 ===== */}
        {stage === 'done' && (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                分轨上传完成！
              </p>
            </div>

            {uploadResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">上传结果：</p>
                {uploadResults.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                      r.skipped
                        ? 'bg-gray-50 dark:bg-gray-800/50 text-muted-foreground'
                        : r.success
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    }`}
                  >
                    <span className="shrink-0">
                      {r.skipped ? '⏭' : r.success ? '✓' : '✗'}
                    </span>
                    <span className="truncate flex-1">{r.filename}</span>
                    {r.skipped && <span className="shrink-0 text-muted-foreground">已跳过</span>}
                    {!r.success && !r.skipped && (
                      <span className="shrink-0 text-red-500">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={onClose}>关闭</Button>
            </DialogFooter>
          </div>
        )}

        {/* ===== 错误 ===== */}
        {stage === 'error' && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                分轨失败
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1 break-all">
                {errorMsg}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>关闭</Button>
              <Button onClick={() => { setStage('select-format'); setErrorMsg(''); }}>
                重试
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};