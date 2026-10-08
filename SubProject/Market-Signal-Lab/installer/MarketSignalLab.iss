#ifndef StageDir
  #error StageDir define is required
#endif
#ifndef OutputDir
  #error OutputDir define is required
#endif
#ifndef AppVersion
  #error AppVersion define is required
#endif
#ifndef SourceHead
  #error SourceHead define is required
#endif
#ifndef VersionInfoVersion
  #error VersionInfoVersion define is required
#endif

[Setup]
AppId={{3A8A0C2E-6F29-4D62-B6E7-3177732B55DD}
AppName=Market Signal Lab
AppVersion={#AppVersion}
AppPublisher=Market Signal Lab
DefaultDirName={autopf}\Market Signal Lab
DefaultGroupName=Market Signal Lab
OutputDir={#OutputDir}
OutputBaseFilename=Market-Signal-Lab-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
CloseApplications=yes
RestartApplications=no
DisableProgramGroupPage=yes
WizardStyle=modern
UninstallDisplayIcon={app}\Market Signal Lab.exe
VersionInfoDescription=Market Signal Lab {#AppVersion}
VersionInfoProductName=Market Signal Lab
VersionInfoProductVersion={#VersionInfoVersion}
VersionInfoVersion={#VersionInfoVersion}

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Icons]
Name: "{group}\Market Signal Lab"; Filename: "{app}\Market Signal Lab.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Market Signal Lab"; Filename: "{app}\Market Signal Lab.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Market Signal Lab.exe"; Description: "Launch Market Signal Lab"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
