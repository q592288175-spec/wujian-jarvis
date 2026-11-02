param([Parameter(Mandatory=$true)][string]$Executable,[string]$AppId='com.wujian.jarvis')
$ErrorActionPreference='Stop'
$programs=[Environment]::GetFolderPath('Programs')
$shortcutPath=Join-Path $programs '小木.lnk'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath=$Executable
$shortcut.WorkingDirectory=Split-Path $Executable -Parent
$shortcut.Description='小木国内期货工作台'
$shortcut.Save()
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XiaomuShortcut {
 [StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid fmtid; public uint pid; }
 [StructLayout(LayoutKind.Explicit,Size=24)] public struct PropVariant {
  [FieldOffset(0)] public ushort vt;
  [FieldOffset(8)] public IntPtr pointer;
 }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IPropertyStore {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index,out PropertyKey key);
  [PreserveSig] int GetValue(ref PropertyKey key,out PropVariant value);
  [PreserveSig] int SetValue(ref PropertyKey key,ref PropVariant value);
  [PreserveSig] int Commit();
 }
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=false)]
 static extern void SHGetPropertyStoreFromParsingName(string path,IntPtr bind,uint flags,ref Guid id,[MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
 public static void SetAppId(string path,string appId) {
  Guid id=new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");IPropertyStore store;
  SHGetPropertyStoreFromParsingName(path,IntPtr.Zero,2,ref id,out store);
  PropertyKey key=new PropertyKey{fmtid=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),pid=5};
  PropVariant value=new PropVariant{vt=31,pointer=Marshal.StringToCoTaskMemUni(appId)};
  try { Marshal.ThrowExceptionForHR((int)store.SetValue(ref key,ref value));Marshal.ThrowExceptionForHR((int)store.Commit()); }
  finally {Marshal.FreeCoTaskMem(value.pointer);Marshal.ReleaseComObject(store);}
 }
}
'@
[XiaomuShortcut]::SetAppId($shortcutPath,$AppId)
