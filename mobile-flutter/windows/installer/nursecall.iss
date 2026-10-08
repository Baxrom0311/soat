; NurseCall for Windows -- the installer the ward PCs get.
;
; Built by .github/workflows/windows-desktop.yml, which passes:
;   /DAppVersion=3.0.3       taken from pubspec.yaml
;   /DSourceDir=...\Release  the `flutter build windows` output, with the
;                            Visual C++ runtime DLLs already copied next to the exe
;
; Build by hand on a Windows machine from mobile-flutter\:
;   flutter build windows --release
;   iscc /DAppVersion=3.0.3 /DSourceDir=..\..\build\windows\x64\runner\Release windows\installer\nursecall.iss

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\build\windows\x64\runner\Release"
#endif

[Setup]
; Fixed for good: Windows recognises an upgrade by this id. A new id would
; install a second copy beside the first, and two copies ring twice.
AppId={{6E0C2B4A-8E57-4B1F-9C3A-7D51F2A9B0E4}
AppName=NurseCall
AppVersion={#AppVersion}
AppVerName=NurseCall {#AppVersion}
AppPublisher=BOOS
AppPublisherURL=https://nurcecall.boos.uz
DefaultDirName={autopf}\NurseCall
DefaultGroupName=NurseCall
DisableProgramGroupPage=yes
OutputBaseFilename=NurseCall-Setup-{#AppVersion}
SetupIconFile=..\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\nursecall.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
; Installs for every user of the PC by default (a ward PC is shared); a
; non-admin can still choose "just for me".
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
; An upgrade must not leave the old process ringing with old code.
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
; Checked by default: a PC that reboots overnight and comes back without the
; app running is a nurses' station that has stopped ringing without telling
; anybody.
Name: "autostart"; Description: "Start NurseCall when Windows starts"; GroupDescription: "Startup:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\NurseCall"; Filename: "{app}\nursecall.exe"
Name: "{autodesktop}\NurseCall"; Filename: "{app}\nursecall.exe"; Tasks: desktopicon
Name: "{commonstartup}\NurseCall"; Filename: "{app}\nursecall.exe"; Tasks: autostart; Check: IsAdminInstallMode
Name: "{userstartup}\NurseCall"; Filename: "{app}\nursecall.exe"; Tasks: autostart; Check: not IsAdminInstallMode

[Run]
Filename: "{app}\nursecall.exe"; Description: "{cm:LaunchProgram,NurseCall}"; Flags: nowait postinstall skipifsilent
