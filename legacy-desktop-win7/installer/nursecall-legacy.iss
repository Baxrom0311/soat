; NurseCall (legacy) -- the Windows 7-compatible installer.
;
; Exists alongside mobile-flutter/windows/installer/nursecall.iss, not
; instead of it: the Flutter build is what every Windows 10/11 ward PC gets,
; and Flutter's Windows embedder cannot run on Windows 7/8 at all (not a
; setting, an engine limitation -- see legacy-desktop-win7's own context in
; the plan this was built from). This installer is only for the PCs that
; cannot take that build.
;
; Built by .github/workflows/legacy-desktop.yml, which passes:
;   /DAppVersion=1.0.0     a version for this client, independent of the
;                          Flutter app's own version numbers -- the two
;                          codebases do not share a release cadence.
;   /DSourceDir=...\net48  the `dotnet build` output (net48 is Windows-only
;                          and framework-dependent, so the ordinary build
;                          output already is the thing to ship -- no
;                          publish/runtime-identifier step needed)
;
; Build by hand on a Windows machine from legacy-desktop-win7\:
;   dotnet build NurseCall\NurseCall.csproj -c Release
;   iscc /DAppVersion=1.0.0 /DSourceDir=NurseCall\bin\Release\net48 installer\nursecall-legacy.iss

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\NurseCall\bin\Release\net48"
#endif

[Setup]
; A different id from the Flutter installer's -- the two are meant to
; coexist on the fleet (different PCs), never to "upgrade" one into the
; other.
AppId={{A1F3C9D2-5B6E-4A8F-9C1D-3E7B2F4A6C8D}
AppName=NurseCall (Windows 7)
AppVersion={#AppVersion}
AppVerName=NurseCall {#AppVersion}
AppPublisher=BOOS
AppPublisherURL=https://nurcecall.boos.uz
DefaultDirName={autopf}\NurseCall
DefaultGroupName=NurseCall
DisableProgramGroupPage=yes
OutputBaseFilename=NurseCall-Legacy-Setup-{#AppVersion}
SetupIconFile=..\NurseCall\Assets\app_icon.ico
UninstallDisplayIcon={app}\NurseCall.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Windows 7 SP1 is the actual floor; 6.1 is Windows 7's own version number
; (the Flutter installer's MinVersion=10.0 is exactly what this one exists
; to not require).
MinVersion=6.1sp1
ArchitecturesAllowed=x86 x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Start NurseCall when Windows starts"; GroupDescription: "Startup:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\NurseCall"; Filename: "{app}\NurseCall.exe"
Name: "{autodesktop}\NurseCall"; Filename: "{app}\NurseCall.exe"; Tasks: desktopicon
Name: "{commonstartup}\NurseCall"; Filename: "{app}\NurseCall.exe"; Tasks: autostart; Check: IsAdminInstallMode
Name: "{userstartup}\NurseCall"; Filename: "{app}\NurseCall.exe"; Tasks: autostart; Check: not IsAdminInstallMode

[Run]
Filename: "{app}\NurseCall.exe"; Description: "{cm:LaunchProgram,NurseCall}"; Flags: nowait postinstall skipifsilent

[Code]
// Windows 7 did not ship .NET Framework 4.8 -- it has to be present before
// NurseCall.exe can run at all, and a missing-runtime failure with no
// explanation is exactly the kind of thing nobody at a ward PC can fix
// themselves. 528040 is the registry release value Microsoft documents for
// 4.8 (any OS); checked before Setup's own wizard pages so the admin is told
// up front, not after sitting through the install.
function IsDotNet48OrNewer(): Boolean;
var
  release: Cardinal;
begin
  Result := RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', release)
    and (release >= 528040);
end;

function InitializeSetup(): Boolean;
var
  resultCode: Integer;
begin
  Result := True;
  if not IsDotNet48OrNewer() then
  begin
    if MsgBox('Bu kompyuterda .NET Framework 4.8 topilmadi. NurseCall shusiz ishlamaydi.' + #13#10 + #13#10 +
       'Hozir Microsoft sahifasidan yuklab olasizmi? Yuklab o''rnatgandan keyin NurseCall o''rnatuvchisini qayta ishga tushiring.',
       mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://dotnet.microsoft.com/download/dotnet-framework/net48', '', '', SW_SHOW, ewNoWait, resultCode);
    Result := False;
  end;
end;
