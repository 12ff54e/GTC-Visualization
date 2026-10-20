# 跨平台 release 打包修复

## 问题来源

Windows 上的 bsdtar 会将部分目录的只读属性记录为 `0555` 权限，并在默认 PAX 格式中写入 `SCHILY.fflags=rdonly`。Linux 上可能出现扩展属性警告；如果同一目录稍后还有文件待解压，或覆盖已存在的只读目录，则可能报 `Permission denied`。

## 修复方式

`util/pack.js` 在临时目录中复制发布文件后，清除暂存文件和目录的只读属性，并使用 POSIX ustar 格式打包。源代码目录的权限不变。ustar 不携带 Windows/BSD 文件标记、ACL 或扩展属性。系统支持 POSIX 权限时，暂存目录设为 `0755`、文件设为 `0644`；Windows chmod 只支持其对应的读写属性，Linux 正常解压时仍按用户 umask 收紧权限。

在源码根目录运行：

```sh
npm run pack
```

如果前后端已经构建完成，仅重新生成压缩包可使用：

```sh
node util/pack.js
```

压缩包仍为 `GTC-Visualization.tar.gz`，解压后的根目录仍为 `GTC-Visualization/`。

## 已经解压失败的目录

在包含压缩包和已有 `GTC-Visualization/` 的目录运行：

```sh
chmod -R u+rwX GTC-Visualization
tar --delay-directory-restore -xf GTC-Visualization.tar.gz
chmod -R u+rwX GTC-Visualization
```

GNU tar 的 `--delay-directory-restore` 会等全部成员提取完成后再恢复目录权限，避免旧包提前将目录设为只读。最后一行恢复当前用户写权限，便于后续更新。旧包的扩展属性警告仍可能出现；修复后的新包不再携带这些属性。

## 检查

```sh
node --test test/pack.test.js
```

检查从只读目录创建包、归档目录可写、没有平台扩展头、原目录权限未被修改、实际解压和解压后写入成功，以及缺少必需文件时明确失败。
