import React from 'react';
import { useDownloadStore } from '@/store/downloadStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CheckCircle2, CircleDashed, AlertCircle, DownloadCloud, Trash2 } from 'lucide-react';

function getStatusMeta(status: 'pending' | 'downloading' | 'success' | 'failed') {
  switch (status) {
    case 'pending':
      return { label: '等待中', icon: <CircleDashed className="w-4 h-4 text-muted-foreground" /> };
    case 'downloading':
      return { label: '处理中', icon: <DownloadCloud className="w-4 h-4 text-blue-500" /> };
    case 'success':
      return { label: '已完成', icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
    case 'failed':
      return { label: '失败', icon: <AlertCircle className="w-4 h-4 text-red-500" /> };
  }
}

export const DownloadManager: React.FC = () => {
  const { tasks, showManager, setShowManager, removeTask, clearCompleted } = useDownloadStore();

  return (
    <Dialog open={showManager} onOpenChange={setShowManager}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>下载管理</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto border rounded-md">
          {tasks.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              暂无任务
            </div>
          ) : (
            <div className="divide-y">
              {tasks.map(task => {
                const meta = getStatusMeta(task.status);
                return (
                  <div key={task.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {meta.icon}
                        <span className="text-sm font-medium truncate">{task.songName}</span>
                        <span className="text-xs text-muted-foreground">{meta.label}</span>
                      </div>

                      <div className="text-xs break-all text-muted-foreground">
                        上传目标: {task.targetPanPath}
                      </div>

                      <div className="h-2 mt-2 overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full transition-all ${task.status === 'failed' ? 'bg-red-500' : 'bg-primary'}`}
                          style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{task.progress}%</span>
                        {task.error ? <span className="text-red-500">{task.error}</span> : null}
                      </div>
                    </div>

                    <Button variant="ghost" size="sm" onClick={() => removeTask(task.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={clearCompleted}>清理已结束任务</Button>
          <Button onClick={() => setShowManager(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
