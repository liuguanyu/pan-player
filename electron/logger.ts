/**
 * 跨平台日志工具
 * 解决Windows命令行中文乱码问题
 * 在Windows下使用GBK编码输出
 * 在macOS和Linux下使用UTF-8编码输出
 */

const isWindows = process.platform === 'win32';

/**
 * 在Windows下使用GBK编码输出到控制台
 */
function writeGBK(message: string, isError: boolean = false): void {
  try {
    // 动态加载iconv-lite以避免打包问题
    const iconv = require('iconv-lite');
    const buffer = iconv.encode(message + '\n', 'gbk');
    
    if (isError) {
      process.stderr.write(buffer);
    } else {
      process.stdout.write(buffer);
    }
  } catch (error) {
    // 如果iconv-lite不可用，回退到普通console输出
    const consoleFn = isError ? console.error : console.log;
    consoleFn(message);
  }
}

/**
 * 格式化日志参数
 */
function formatArgs(...args: any[]): string {
  return args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

/**
 * 日志对象
 */
const logger = {
  log: (...args: any[]) => {
    const message = formatArgs(...args);
    if (isWindows) {
      writeGBK(message, false);
    } else {
      console.log(message);
    }
  },
  
  error: (...args: any[]) => {
    const message = formatArgs(...args);
    if (isWindows) {
      writeGBK('[ERROR] ' + message, true);
    } else {
      console.error(message);
    }
  },
  
  warn: (...args: any[]) => {
    const message = formatArgs(...args);
    if (isWindows) {
      writeGBK('[WARN] ' + message, false);
    } else {
      console.warn(message);
    }
  },
  
  info: (...args: any[]) => {
    const message = formatArgs(...args);
    if (isWindows) {
      writeGBK('[INFO] ' + message, false);
    } else {
      console.info(message);
    }
  }
};

export default logger;